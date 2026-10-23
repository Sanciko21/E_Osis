"""
Load test E-OSIS dengan Locust — mengukur kemampuan server saat banyak siswa memilih bersamaan.

Skenario (bobot bisa diatur lewat environment, lihat loadtest/README.md):
  * Siswa              — buka beranda (jadwal + kartu paslon), membaca sebentar, lalu memilih dengan
                          NISN uji acak. Setiap putaran = satu siswa baru. Sesekali NISN yang sama
                          dikirim ulang untuk memastikan server tetap MENOLAK suara ganda saat ramai.
  * Pengunjung         — hanya melihat beranda, halaman hasil, dan health check.
  * PanitiaLiveReport  — login admin lalu memuat dashboard setiap 5 detik (seperti panel Live Report).
                          Hanya aktif bila LOADTEST_ADMIN_EMAIL & LOADTEST_ADMIN_PASSWORD diisi.

Pengaman: suara HANYA dikirim ke pemilihan berjudul "[DEMO] ..." yang sedang dibuka. Bila pemilihan
aktif bukan demo, tes berjalan tanpa voting (hanya membaca) kecuali LOADTEST_ALLOW_NON_DEMO=1.
Semua suara uji memakai NISN berawalan 98 dan ikut terhapus oleh server/sql/demo-delete.sql.
"""

import logging
import os
import random
import secrets
import time

import requests
from locust import HttpUser, LoadTestShape, between, events, task
from locust.exception import StopUser


def env_flag(name, default=False):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "ya", "on"}


def env_number(name, default, cast=int):
    value = os.getenv(name)
    return cast(value) if value not in (None, "") else default


DEMO_PREFIX = "[DEMO]"
NISN_PREFIX = os.getenv("LOADTEST_NISN_PREFIX", "98")  # demo-votes.sql memakai 99 — tidak bertabrakan
VOTES_ENABLED = env_flag("LOADTEST_VOTES", True)
ALLOW_NON_DEMO = env_flag("LOADTEST_ALLOW_NON_DEMO", False)
RECHECK_DUPLICATE_RATIO = env_number("LOADTEST_DUPLICATE_RATIO", 0.1, float)
THINK_MIN = env_number("LOADTEST_THINK_MIN", 2.0, float)
THINK_MAX = env_number("LOADTEST_THINK_MAX", 6.0, float)
ADMIN_EMAIL = os.getenv("LOADTEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("LOADTEST_ADMIN_PASSWORD", "")
LIVE_SCREENS = env_number("LOADTEST_LIVE_SCREENS", 1)
LIVE_REFRESH_SECONDS = env_number("LOADTEST_LIVE_REFRESH", 5.0, float)
# Batas lulus/gagal untuk mode headless (kode keluar 1 bila terlampaui).
MAX_FAIL_RATIO = env_number("LOADTEST_MAX_FAIL_RATIO", 0.01, float)
MAX_P95_MS = env_number("LOADTEST_MAX_P95_MS", 1500)
MAX_VOTE_P95_MS = env_number("LOADTEST_MAX_VOTE_P95_MS", 2000)

log = logging.getLogger("eosis.loadtest")

# Diisi saat test_start: pemilihan sasaran & apakah voting diizinkan.
STATE = {"election_id": None, "votes_allowed": False, "title": None}


def new_nisn():
    """NISN uji 10 digit: prefiks + 8 digit acak kriptografis (peluang tabrakan sangat kecil)."""
    digits = 10 - len(NISN_PREFIX)
    return f"{NISN_PREFIX}{secrets.randbelow(10 ** digits):0{digits}d}"


@events.test_start.add_listener
def check_target(environment, **_kwargs):
    """Menentukan pemilihan sasaran dan menegakkan pengaman sebelum ada beban dikirim."""
    host = (environment.host or "").rstrip("/")
    try:
        response = requests.get(f"{host}/api/elections/current", timeout=15)
        response.raise_for_status()
        election = response.json().get("data")
    except Exception as error:  # noqa: BLE001 — pesan jelas lebih penting daripada jenis error
        log.error("Tidak dapat menghubungi %s/api/elections/current: %s", host, error)
        if environment.runner:
            environment.runner.quit()
        return

    if not election:
        log.warning("Belum ada pemilihan. Tes berjalan HANYA membaca (tanpa voting).")
        return

    STATE["election_id"] = election["id"]
    STATE["title"] = election["title"]
    is_demo = election["title"].startswith(DEMO_PREFIX)
    is_open = election.get("votingOpen") is True

    if not VOTES_ENABLED:
        log.info("LOADTEST_VOTES=0: tes HANYA membaca.")
    elif not is_open:
        log.warning("Pemilihan '%s' tidak sedang dibuka (fase %s): tes berjalan tanpa voting.", election["title"], election.get("phase"))
    elif not is_demo and not ALLOW_NON_DEMO:
        log.warning(
            "Pemilihan aktif '%s' BUKAN pemilihan %s. Demi keamanan data, voting dimatikan "
            "(set LOADTEST_ALLOW_NON_DEMO=1 hanya untuk database uji).",
            election["title"],
            DEMO_PREFIX,
        )
    else:
        STATE["votes_allowed"] = True
        log.info("Sasaran voting: '%s' (NISN uji berawalan %s).", election["title"], NISN_PREFIX)


def expect(response, *allowed_statuses):
    """Menandai respons sukses bila statusnya termasuk yang diharapkan; 429 dilabeli jelas."""
    if response.status_code in allowed_statuses:
        response.success()
    elif response.status_code == 429:
        response.failure("429 dibatasi rate limit server (lihat README: menaikkan batas saat uji)")
    elif response.status_code == 0:
        response.failure(f"Tidak ada respons (koneksi gagal/timeout): {response.error}")
    else:
        code = ""
        try:
            code = response.json().get("error", {}).get("code", "")
        except ValueError:
            pass
        response.failure(f"HTTP {response.status_code} {code}".strip())


class BerandaMixin:
    """Permintaan yang sama dengan saat halaman beranda dibuka."""

    def load_landing(self):
        with self.client.get("/api/elections/current", name="GET /api/elections/current", catch_response=True) as response:
            expect(response, 200)
        election_id = STATE["election_id"]
        if not election_id:
            return []
        with self.client.get(
            f"/api/elections/{election_id}/candidates",
            name="GET /api/elections/[id]/candidates",
            catch_response=True,
        ) as response:
            expect(response, 200)
            if response.status_code == 200:
                return response.json().get("data") or []
        return []


class Siswa(BerandaMixin, HttpUser):
    """Satu putaran = satu siswa baru: buka beranda → baca kartu paslon → pilih dengan NISN-nya."""

    weight = env_number("LOADTEST_WEIGHT_SISWA", 10)
    wait_time = between(1, 3)

    @task
    def memilih(self):
        candidates = self.load_landing()
        time.sleep(random.uniform(THINK_MIN, THINK_MAX))  # membaca visi & misi
        if not (STATE["votes_allowed"] and candidates):
            return
        election_id = STATE["election_id"]
        candidate_id = random.choice(candidates)["id"]
        nisn = new_nisn()

        status = self.vote(election_id, nisn, candidate_id, name="POST /api/elections/[id]/vote")
        if status == 409:
            # NISN acak kebetulan sudah dipakai (sangat jarang): ulangi sebagai siswa lain.
            self.vote(election_id, new_nisn(), candidate_id, name="POST /api/elections/[id]/vote")
        elif status == 201 and random.random() < RECHECK_DUPLICATE_RATIO:
            # Integritas saat ramai: NISN yang sama WAJIB ditolak 409 ALREADY_VOTED.
            with self.client.post(
                f"/api/elections/{election_id}/vote",
                json={"nisn": nisn, "candidateId": candidate_id},
                name="POST vote ulang NISN sama (harus 409)",
                catch_response=True,
            ) as response:
                if response.status_code == 409:
                    response.success()
                elif response.status_code == 201:
                    response.failure("SUARA GANDA DITERIMA — integritas gagal!")
                else:
                    expect(response, 409)

    def vote(self, election_id, nisn, candidate_id, name):
        with self.client.post(
            f"/api/elections/{election_id}/vote",
            json={"nisn": nisn, "candidateId": candidate_id},
            name=name,
            catch_response=True,
        ) as response:
            if response.status_code == 201 and response.json().get("data", {}).get("recorded") is True:
                response.success()
            elif response.status_code == 409:
                response.success()  # ditangani pemanggil (tabrakan NISN acak)
            else:
                expect(response, 201)
            return response.status_code


class Pengunjung(BerandaMixin, HttpUser):
    """Pengunjung yang hanya melihat-lihat beranda dan halaman hasil."""

    weight = env_number("LOADTEST_WEIGHT_PENGUNJUNG", 3)
    wait_time = between(3, 8)

    @task(3)
    def beranda(self):
        self.load_landing()

    @task(1)
    def hasil(self):
        election_id = STATE["election_id"]
        if not election_id:
            return
        # 403 RESULTS_NOT_PUBLIC adalah jawaban benar selama hasil belum dipublikasikan.
        with self.client.get(
            f"/api/elections/{election_id}/results", name="GET /api/elections/[id]/results", catch_response=True
        ) as response:
            expect(response, 200, 403)

    @task(1)
    def health(self):
        with self.client.get("/api/health", name="GET /api/health", catch_response=True) as response:
            expect(response, 200)


if ADMIN_EMAIL and ADMIN_PASSWORD:

    class PanitiaLiveReport(HttpUser):
        """Layar Live Report/dashboard panitia: login sekali, lalu memuat dashboard berkala."""

        fixed_count = LIVE_SCREENS
        wait_time = between(LIVE_REFRESH_SECONDS, LIVE_REFRESH_SECONDS)

        def on_start(self):
            with self.client.post(
                "/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                name="POST /api/auth/login",
                catch_response=True,
            ) as response:
                expect(response, 200)
            if response.status_code != 200:
                log.error("Login panitia gagal (HTTP %s): layar Live Report tidak disimulasikan.", response.status_code)
                raise StopUser()

        @task
        def dashboard(self):
            with self.client.get("/api/admin/dashboard", name="GET /api/admin/dashboard", catch_response=True) as response:
                expect(response, 200)


if os.getenv("LOADTEST_SHAPE") == "hari-pemilihan":

    class HariPemilihan(LoadTestShape):
        """
        Simulasi hari pemilihan: siswa berdatangan saat bel masuk, memuncak saat jam istirahat, lalu
        mereda. Puncak = LOADTEST_PEAK_USERS pengguna serentak (bawaan 300); lama total =
        LOADTEST_SHAPE_MINUTES (bawaan 14 menit, tahapan ikut dipadatkan/diregangkan).
        Bentuk ini menggantikan opsi -u/-r/--run-time.
        """

        peak = env_number("LOADTEST_PEAK_USERS", 300)
        scale = env_number("LOADTEST_SHAPE_MINUTES", 14.0, float) / 14.0
        # (detik akhir tahap pada skala 14 menit, porsi pengguna dari puncak)
        stages = [
            (120, 0.2),  # 0–2 menit: bel masuk, 20% puncak
            (360, 1.0),  # 2–6 menit: naik ke puncak (jam istirahat)
            (600, 1.0),  # 6–10 menit: bertahan di puncak
            (720, 0.3),  # 10–12 menit: mereda
            (840, 0.1),  # 12–14 menit: sisa siswa
        ]

        def tick(self):
            elapsed = self.get_run_time()
            for end, share in self.stages:
                if elapsed < end * self.scale:
                    users = max(1, round(self.peak * share))
                    spawn_rate = max(1, round(self.peak / max(1, 30 * self.scale)))
                    return users, spawn_rate
            return None


@events.quitting.add_listener
def summarize(environment, **_kwargs):
    """Ringkasan berbahasa Indonesia + kode keluar 1 bila batas lulus terlampaui (berguna di CI)."""
    stats = environment.stats.total
    if stats.num_requests == 0:
        return
    vote = environment.stats.get("POST /api/elections/[id]/vote", "POST")
    rate_limited = sum(
        error.occurrences for error in environment.stats.errors.values() if "429" in str(error.error)
    )
    lines = [
        "",
        "================ RINGKASAN LOAD TEST E-OSIS ================",
        f"Sasaran          : {environment.host} - {STATE['title'] or 'tanpa pemilihan'}",
        f"Total permintaan : {stats.num_requests} ({stats.total_rps:.1f} req/detik rata-rata)",
        f"Gagal            : {stats.num_failures} ({stats.fail_ratio:.2%})",
        f"Waktu respons    : median {stats.median_response_time:.0f} ms | p95 {stats.get_response_time_percentile(0.95):.0f} ms"
        f" | p99 {stats.get_response_time_percentile(0.99):.0f} ms | maks {stats.max_response_time:.0f} ms",
    ]
    if vote.num_requests:
        lines.append(
            f"Voting           : {vote.num_requests} suara | median {vote.median_response_time:.0f} ms"
            f" | p95 {vote.get_response_time_percentile(0.95):.0f} ms | gagal {vote.num_failures}"
        )
    if rate_limited:
        lines.append(
            f"Rate limit (429) : {rate_limited} permintaan dibatasi - ini batas pengaman per IP, bukan "
            "kapasitas server. Naikkan VOTE_RATE_LIMIT_MAX/API_RATE_LIMIT_MAX di server uji (lihat README)."
        )

    problems = []
    if stats.fail_ratio > MAX_FAIL_RATIO:
        problems.append(f"rasio gagal {stats.fail_ratio:.2%} > {MAX_FAIL_RATIO:.2%}")
    if stats.get_response_time_percentile(0.95) > MAX_P95_MS:
        problems.append(f"p95 {stats.get_response_time_percentile(0.95):.0f} ms > {MAX_P95_MS} ms")
    if vote.num_requests and vote.get_response_time_percentile(0.95) > MAX_VOTE_P95_MS:
        problems.append(f"p95 voting {vote.get_response_time_percentile(0.95):.0f} ms > {MAX_VOTE_P95_MS} ms")
    lines.append("Hasil            : " + ("LULUS" if not problems else "TIDAK LULUS - " + "; ".join(problems)))
    lines.append("=============================================================")
    print("\n".join(lines))
    if problems:
        environment.process_exit_code = 1

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import CandidateDetail from '../components/candidates/CandidateDetail.jsx';
import Hero from '../components/landing/Hero.jsx';
import { CandidatesSection, FaqSection, HowToVote, ResultsCallout } from '../components/landing/InfoSections.jsx';
import ScheduleSection from '../components/landing/ScheduleSection.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import Icon from '../components/ui/Icon.jsx';
import { useCardVoting } from '../hooks/useCardVoting.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useNow } from '../hooks/useNow.js';
import { useResource } from '../hooks/useResource.js';
import { getCurrentElection, getElectionCandidates } from '../services/electionsApi.js';
import { effectivePhase, formatCandidateNumber } from '../utils/election.js';

async function loadLanding(signal) {
  const { election, clockOffsetMs } = await getCurrentElection(signal);
  const candidates = election ? await getElectionCandidates(election.id, signal) : [];
  return { election, clockOffsetMs, candidates };
}

export default function LandingPage() {
  useDocumentTitle(null);
  const { data, error, loading, reload } = useResource(loadLanding, []);
  const [detail, setDetail] = useState(null);
  const now = useNow(data?.clockOffsetMs);
  const election = data?.election ?? null;
  const candidates = data?.candidates ?? [];
  // Siswa memilih langsung dari kartu paslon selama jadwal pemungutan suara berjalan.
  const votingOpen = Boolean(election) && effectivePhase(election, now) === 'open';
  const { vote, busy: voteBusy } = useCardVoting(election, { onStale: reload });

  // Router menggulir ke #kandidat/#jadwal saat konten masih "memuat"; setelah jadwal & kartu tampil,
  // halaman bertambah tinggi sehingga posisinya meleset. Gulir ulang sekali per hash setelah data siap.
  const { hash } = useLocation();
  const scrolledHashRef = useRef(null);
  useEffect(() => {
    if (loading || !hash || scrolledHashRef.current === hash) return;
    scrolledHashRef.current = hash;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [loading, hash]);

  // "Pilih pasangan ini" dari dialog visi & misi: voting dimulai SETELAH dialog modal benar-benar
  // tertutup (dan fokusnya dikembalikan), agar dialog NISN tidak tertutup/terhalang dialog tersebut.
  const pendingVoteRef = useRef(null);
  useEffect(() => {
    if (detail || !pendingVoteRef.current) return;
    const candidate = pendingVoteRef.current;
    pendingVoteRef.current = null;
    vote(candidate);
  }, [detail, vote]);

  return (
    <>
      <Hero election={election} loading={loading} votingOpen={votingOpen} />
      <ScheduleSection election={election} loading={loading} error={error} onRetry={reload} now={now} />
      <HowToVote />
      <CandidatesSection
        candidates={candidates}
        election={election}
        loading={loading}
        error={error}
        onRetry={reload}
        onShowDetail={setDetail}
        votingOpen={votingOpen}
        onVote={vote}
        voteBusy={voteBusy}
      />
      <ResultsCallout election={election} />
      <FaqSection />

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Visi & Misi Pasangan Nomor ${formatCandidateNumber(detail.candidateNumber)}` : ''}
        size="lg"
        footer={
          detail &&
          votingOpen && (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDetail(null)}>
                Tutup
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={voteBusy}
                onClick={() => {
                  pendingVoteRef.current = detail;
                  setDetail(null);
                }}
              >
                <Icon name="ballot" size={18} /> Pilih pasangan ini
              </button>
            </>
          )
        }
      >
        {detail && <CandidateDetail candidate={detail} />}
      </Dialog>
    </>
  );
}

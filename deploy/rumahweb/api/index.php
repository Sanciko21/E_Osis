<?php
/**
 * E-OSIS — proxy API untuk hosting cPanel (Rumahweb).
 *
 * Meneruskan setiap request {BASE}api/... ke Supabase Edge Function "api", sama seperti rewrite
 * /api/* di vercel.json. Browser tetap melihat SATU origin (domain sekolah), sehingga cookie sesi
 * admin (__Host-, SameSite=Strict) dan token CSRF berfungsi. Tidak ada logika aplikasi maupun
 * rahasia di sini: validasi NISN, aturan satu suara, dan hak akses tetap dijalankan API.
 *
 * Kompatibel PHP 7.0+ dan semua mode PHP hosting (tidak bergantung pada getallheaders()).
 * Dibuat oleh `npm run build:rumahweb` (client/scripts/prepare-rumahweb.js) dari
 * deploy/rumahweb/api/index.php — ubah templatnya, bukan hasil build.
 */

define('UPSTREAM', '__UPSTREAM__');   // mis. https://<project-ref>.supabase.co/functions/v1
define('BASE_PATH', '__BASE_PATH__'); // mis. /E-Voting/
define('TIMEOUT_SECONDS', 70);        // > batas unggah foto di frontend (60 dtk)

function fail($status, $code, $message)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(array('error' => array('code' => $code, 'message' => $message)));
    exit;
}

/** Header permintaan dari $_SERVER (HTTP_X_CSRF_TOKEN → x-csrf-token). */
function request_headers()
{
    $headers = array();
    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') === 0) {
            $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
        }
    }
    foreach (array('CONTENT_TYPE' => 'content-type', 'CONTENT_LENGTH' => 'content-length') as $key => $name) {
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            $headers[$name] = $_SERVER[$key];
        }
    }
    return $headers;
}

header('X-Content-Type-Options: nosniff');

if (!function_exists('curl_init')) {
    fail(500, 'PROXY_CURL_MISSING', 'Ekstensi PHP curl belum aktif. Aktifkan lewat cPanel → Select PHP Version → Extensions.');
}

// 1. Ambil path API dari URL asli: {BASE}api/... → /api/...
$prefix = rtrim(BASE_PATH, '/');
$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
if (strpos($uri, $prefix . '/api') !== 0) {
    fail(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
}
$path = substr($uri, strlen($prefix)); // "/api/auth/login?x=1"
$queryAt = strpos($path, '?');
$pathOnly = $queryAt === false ? $path : substr($path, 0, $queryAt);
if (!preg_match('#^/api(/[A-Za-z0-9._~\-/%]*)?$#', $pathOnly) || strpos($pathOnly, '..') !== false) {
    fail(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
}

// 2. Header permintaan yang diteruskan (whitelist; Host & header hop-by-hop tidak ikut).
$forward = array('accept', 'accept-language', 'content-type', 'cookie', 'origin', 'user-agent', 'x-csrf-token');
$incoming = request_headers();
$headers = array();
foreach ($forward as $name) {
    if (isset($incoming[$name])) {
        $headers[] = $name . ': ' . $incoming[$name];
    }
}
// IP siswa: ditulis ulang dari koneksi (bukan dari header kiriman browser) agar tidak bisa dipalsukan.
$headers[] = 'X-Forwarded-For: ' . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
$headers[] = 'X-Forwarded-Proto: https';
$headers[] = 'Expect:'; // matikan "100-continue" agar unggah foto tidak tertunda

// 3. Isi permintaan. Normalnya mentah dari php://input (enable_post_data_reading=Off di .user.ini).
//    Bila hosting tetap mem-parsing multipart, foto disusun ulang dari $_FILES.
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$body = null;
if (!in_array($method, array('GET', 'HEAD', 'OPTIONS'), true)) {
    $raw = file_get_contents('php://input');
    if ($raw !== '' && $raw !== false) {
        $body = $raw;
    } elseif (!empty($_FILES)) {
        $body = array();
        foreach ($_FILES as $field => $file) {
            if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
                fail(413, 'PAYLOAD_TOO_LARGE', 'Foto gagal diterima server hosting. Pastikan ukurannya maksimal 2 MB.');
            }
            $body[$field] = new CURLFile($file['tmp_name'], $file['type'], $file['name']);
        }
        foreach ($_POST as $field => $value) {
            $body[$field] = $value;
        }
        // Content-Type multipart (beserta boundary baru) dibuat ulang oleh cURL.
        $kept = array();
        foreach ($headers as $header) {
            if (stripos($header, 'content-type:') !== 0) {
                $kept[] = $header;
            }
        }
        $headers = $kept;
    } else {
        $body = '';
    }
}

// 4. Kirim ke Edge Function.
$GLOBALS['proxyResponseHeaders'] = array();
$GLOBALS['proxySetCookies'] = array();

function collect_header($curl, $line)
{
    $parts = explode(':', $line, 2);
    if (count($parts) === 2) {
        $name = strtolower(trim($parts[0]));
        $value = trim($parts[1]);
        $passed = array('content-type', 'cache-control', 'retry-after', 'x-request-id', 'ratelimit', 'ratelimit-policy',
            'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'vary');
        if ($name === 'set-cookie') {
            $GLOBALS['proxySetCookies'][] = $value;
        } elseif (in_array($name, $passed, true)) {
            $GLOBALS['proxyResponseHeaders'][$name] = $value;
        }
    }
    return strlen($line);
}

/**
 * DNS sebagian shared hosting lambat (±5–10 dtk per pencarian). IP Supabase yang terakhir berhasil
 * dihubungi disimpan di berkas kecil (tidak bisa diunduh: semua URL api/* diarahkan ke index.php),
 * sehingga hanya sesekali permintaan yang perlu menunggu DNS.
 */
define('IP_CACHE_FILE', __DIR__ . '/.upstream-ip');
define('IP_CACHE_SECONDS', 6 * 3600);

function cached_upstream_ip()
{
    if (!is_file(IP_CACHE_FILE) || time() - filemtime(IP_CACHE_FILE) > IP_CACHE_SECONDS) {
        return null;
    }
    $ip = trim((string) @file_get_contents(IP_CACHE_FILE));
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? $ip : null;
}

/** Satu kali kirim ke Edge Function. $ip null = cari lewat DNS. */
function send_upstream($url, $method, $headers, $body, $ip)
{
    $GLOBALS['proxyResponseHeaders'] = array();
    $GLOBALS['proxySetCookies'] = array();
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 20); // termasuk DNS hosting yang lambat
    // IPv4 saja: di banyak shared hosting rute IPv6 ke luar tidak berfungsi sehingga koneksi menggantung.
    curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    curl_setopt($ch, CURLOPT_TIMEOUT, TIMEOUT_SECONDS);
    curl_setopt($ch, CURLOPT_ENCODING, ''); // terima gzip, kirim ke browser dalam bentuk terurai
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, 'collect_header');
    if ($ip !== null) {
        // Sertifikat TLS tetap diperiksa terhadap nama host asli; hanya pencarian DNS yang dilewati.
        curl_setopt($ch, CURLOPT_RESOLVE, array(parse_url($url, PHP_URL_HOST) . ':443:' . $ip));
    }
    if ($method === 'HEAD') {
        curl_setopt($ch, CURLOPT_NOBODY, true);
    } elseif ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $result = array('body' => curl_exec($ch), 'errno' => 0, 'error' => '', 'stage' => '', 'status' => 0);
    if ($result['body'] === false) {
        $result['errno'] = curl_errno($ch);
        $result['error'] = curl_error($ch);
        // Tahap yang sudah selesai: dns → connect → tls → (menunggu jawaban).
        $result['stage'] = curl_getinfo($ch, CURLINFO_NAMELOOKUP_TIME) <= 0 ? 'dns'
            : (curl_getinfo($ch, CURLINFO_CONNECT_TIME) <= 0 ? 'connect'
            : (curl_getinfo($ch, CURLINFO_APPCONNECT_TIME) <= 0 ? 'tls' : 'response'));
    } else {
        $result['status'] = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $usedIp = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
        if ($usedIp !== $ip && filter_var($usedIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            @file_put_contents(IP_CACHE_FILE, $usedIp, LOCK_EX);
        }
    }
    curl_close($ch);
    return $result;
}

$cachedIp = cached_upstream_ip();
$result = send_upstream(UPSTREAM . $path, $method, $headers, $body, $cachedIp);
// IP lama tidak bisa dihubungi (mis. Supabase berganti IP): coba sekali lagi lewat DNS. Aman karena
// gagal di tahap dns/connect/tls berarti permintaan (termasuk suara) BELUM terkirim.
if ($result['body'] === false && $cachedIp !== null && $result['stage'] !== 'response') {
    @unlink(IP_CACHE_FILE);
    $result = send_upstream(UPSTREAM . $path, $method, $headers, $body, null);
}
if ($result['body'] === false) {
    error_log('E-OSIS proxy: cURL gagal (' . $result['errno'] . ', tahap ' . $result['stage'] . ') ' . $result['error']);
    // 504/502 dianggap "hasil tidak diketahui" oleh frontend (siswa diminta memeriksa, bukan mengulang buta).
    fail($result['errno'] === 28 ? 504 : 502, 'UPSTREAM_UNAVAILABLE',
        'Server API tidak dapat dihubungi (cURL ' . $result['errno'] . ', tahap ' . $result['stage'] . '). Silakan coba lagi.');
}
$status = $result['status'];
$responseBody = $result['body'];

// 5. Balasan ke browser.
http_response_code($status);
foreach ($GLOBALS['proxyResponseHeaders'] as $name => $value) {
    header($name . ': ' . $value);
}
foreach ($GLOBALS['proxySetCookies'] as $cookie) {
    header('Set-Cookie: ' . $cookie, false);
}
if (!isset($GLOBALS['proxyResponseHeaders']['cache-control'])) {
    header('Cache-Control: no-store');
}
echo $responseBody;

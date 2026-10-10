/** Isi data DEMO — dipakai "npm run db:seed:demo" dan sql/demo.sql (lewat "npm run db:sql"). */
export const DEMO_TITLE_PREFIX = '[DEMO]';
export const DEMO_TITLE = `${DEMO_TITLE_PREFIX} Pemilihan Ketua & Wakil Ketua OSIS 2026/2027`;
/** Foto kartun paslon demo (client/public/demo, dibuat oleh client/scripts/generate-demo-photos.js). */
export const demoPhotoUrl = (number) => `/demo/paslon-${number}.png`;

export const DEMO_DESCRIPTION =
  'Data demonstrasi untuk pengembangan lokal. Hapus sebelum dipakai untuk pemilihan sungguhan.';

export const DEMO_CANDIDATES = Object.freeze([
  {
    chairpersonName: 'Raka Aditya Pratama',
    viceChairpersonName: 'Nabila Putri Lestari',
    vision: 'Mewujudkan OSIS yang aktif, kreatif, dan peduli sebagai rumah bagi seluruh siswa.',
    mission: [
      'Mengadakan forum aspirasi siswa setiap bulan.',
      'Menghidupkan kembali kegiatan ekstrakurikuler bidang seni dan olahraga.',
      'Mengajak siswa menjaga kebersihan lingkungan sekolah melalui program Jumat Bersih.',
    ].join('\n'),
  },
  {
    chairpersonName: 'Dimas Fajar Nugroho',
    viceChairpersonName: 'Salsabila Kirana Dewi',
    vision: 'OSIS yang jujur, terbuka, dan menjadi teladan disiplin bagi warga sekolah.',
    mission: [
      'Membuat papan informasi kegiatan OSIS yang terbuka untuk semua kelas.',
      'Mengadakan program literasi pagi bersama perpustakaan sekolah.',
      'Mendukung lomba antarkelas untuk mempererat persaudaraan.',
    ].join('\n'),
  },
  {
    chairpersonName: 'Aulia Rahmawati',
    viceChairpersonName: 'Bagas Satria Wibowo',
    vision: 'Menjadikan OSIS wadah prestasi dan inovasi yang ramah bagi setiap siswa.',
    mission: [
      'Membentuk kelompok belajar sebaya menjelang ujian.',
      'Menyelenggarakan pentas karya siswa setiap semester.',
      'Mengembangkan kegiatan sosial bersama masyarakat sekitar sekolah.',
    ].join('\n'),
  },
]);

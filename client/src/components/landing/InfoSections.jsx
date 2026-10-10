import { AnimatePresence, m } from 'motion/react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { accordionBody, liftOnHover, revealOnScroll, riseItem, staggerList } from '../../lib/motionPresets.js';
import { aos, prefersReducedMotion } from '../../utils/motion.js';
import CandidateCard from '../candidates/CandidateCard.jsx';
import Icon from '../ui/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../ui/States.jsx';

// Warna aksen tiap langkah hanya dekoratif; urutan langkah juga ditulis sebagai teks.
const STEPS = [
  { icon: 'users', accent: 'blue', title: 'Kenali pasangan calon', text: 'Baca visi & misi setiap pasangan calon pada kartunya.' },
  { icon: 'pointer', accent: 'coral', title: 'Tekan "Pilih"', text: 'Tekan tombol "Pilih" pada kartu pasangan calon pilihanmu.' },
  { icon: 'idCard', accent: 'teal', title: 'Masukkan NISN', text: 'Ketik 10 digit NISN-mu, lalu periksa kembali pilihanmu.' },
  { icon: 'checkCircle', accent: 'gold', title: 'Konfirmasi', text: 'Tekan "Ya, Saya Yakin". Satu NISN hanya bisa memilih satu kali.' },
];

export function HowToVote() {
  return (
    <section className="section section--tinted" aria-labelledby="cara-memilih-title">
      <div className="container">
        <div className="section__header" {...aos('fade-up')}>
          <p className="eyebrow">
            <Icon name="listChecks" size={16} /> Cara memilih
          </p>
          <h2 id="cara-memilih-title" className="section__title">
            Empat langkah <span className="text-gradient">mudah</span>
          </h2>
          <p className="section__lead">Memilih cukup beberapa menit, langsung dari kartu pasangan calon di halaman ini.</p>
        </div>
        <m.ol className="steps" variants={staggerList} {...revealOnScroll()}>
          {STEPS.map((step, index) => (
            <m.li key={step.title} className={`step step--${step.accent}`} variants={riseItem} whileHover={liftOnHover}>
              <span className="step__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="step__icon" aria-hidden="true">
                <Icon name={step.icon} size={24} />
              </span>
              <p className="step__number">Langkah {index + 1}</p>
              <h3 className="step__title">{step.title}</h3>
              <p className="step__text">{step.text}</p>
            </m.li>
          ))}
        </m.ol>
      </div>
    </section>
  );
}

export function CandidatesSection({
  candidates,
  election,
  loading,
  error,
  onRetry,
  onShowDetail,
  votingOpen = false,
  onVote,
  voteBusy = false,
}) {
  return (
    <section id="kandidat" className="section section--candidates" aria-labelledby="kandidat-title">
      <div className="container">
        <div className="section__header" {...aos('fade-up')}>
          <p className="eyebrow">
            <Icon name="users" size={16} /> Pasangan calon
          </p>
          <h2 id="kandidat-title" className="section__title">
            Kenali calon <span className="text-gradient">pemimpin OSIS</span>
          </h2>
          <p className="section__lead">
            {votingOpen
              ? 'Pemungutan suara sedang dibuka. Tekan "Pilih" pada kartu pasangan calon pilihanmu, lalu masukkan NISN.'
              : 'Baca visi dan misi setiap pasangan calon dengan saksama sebelum menentukan pilihan.'}
          </p>
        </div>

        {loading && <LoadingState message="Memuat pasangan calon…" />}
        {!loading && error && <ErrorState title="Pasangan calon gagal dimuat" error={error} onRetry={onRetry} />}
        {!loading && !error && (!election || candidates.length === 0) && (
          <EmptyState icon="users" title="Pasangan calon belum diumumkan">
            Daftar pasangan calon akan tampil di sini setelah diumumkan panitia.
          </EmptyState>
        )}
        {!loading && !error && candidates.length > 0 && (
          <m.div className="candidate-grid" variants={staggerList} {...revealOnScroll({ amount: 0.1 })}>
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onShowDetail={onShowDetail}
                votingOpen={votingOpen}
                onVote={onVote}
                voteDisabled={voteBusy}
              />
            ))}
          </m.div>
        )}
      </div>
    </section>
  );
}

export function ResultsCallout({ election }) {
  const available = election?.resultsAvailable;
  return (
    <section className="section section--callout" aria-labelledby="hasil-title">
      <div className="container">
        <div className={`callout ${available ? 'callout--ready' : ''}`.trim()} {...aos('fade-up')}>
          <span className="callout__icon" aria-hidden="true">
            <Icon name={available ? 'trophy' : 'hourglass'} size={28} />
          </span>
          <div className="callout__body">
            <h2 id="hasil-title" className="callout__title">
              {available ? 'Hasil pemilihan sudah diumumkan' : 'Hasil diumumkan setelah pemilihan selesai'}
            </h2>
            <p>
              {available
                ? 'Lihat perolehan suara setiap pasangan calon yang dihitung langsung dari database.'
                : 'Panitia akan mempublikasikan hasil resmi setelah pemungutan suara ditutup. Hasil sementara tidak ditampilkan ke publik.'}
            </p>
          </div>
          {available && (
            <Link to="/hasil" className="btn btn--accent">
              Lihat hasil <Icon name="arrowRight" size={18} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  {
    icon: 'lock',
    question: 'Apakah pilihanku rahasia?',
    answer:
      'Ya. NISN hanya dipakai untuk memastikan setiap siswa memilih satu kali dan disimpan terpisah dari pilihanmu. Sistem tidak menyediakan fitur untuk melihat pilihan berdasarkan NISN.',
  },
  {
    icon: 'userCheck',
    question: 'Apakah aku harus mendaftar terlebih dahulu?',
    answer: 'Tidak perlu. Cukup masukkan NISN-mu saat pemungutan suara sedang dibuka.',
  },
  {
    icon: 'alert',
    question: 'Bagaimana jika NISN-ku ternyata sudah digunakan?',
    answer: 'Segera laporkan ke panitia pemilihan di sekolah agar dapat ditindaklanjuti.',
  },
  {
    icon: 'refresh',
    question: 'Bisakah aku mengubah pilihan?',
    answer: 'Tidak. Setelah kamu menekan "Ya, Saya Yakin", pilihan langsung tersimpan dan tidak dapat diubah.',
  },
  {
    icon: 'calendar',
    question: 'Kapan hasil pemilihan diumumkan?',
    answer: 'Setelah pemungutan suara ditutup dan panitia mempublikasikan hasil resmi di halaman Hasil.',
  },
];

const FAQ_ACCENTS = ['blue', 'teal', 'coral', 'violet', 'gold'];

/** Satu butir accordion: tombol di dalam heading, isi dibuka/ditutup dengan transisi tinggi (Motion). */
function FaqItem({ item, accent, open, onToggle, reduceMotion }) {
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;
  return (
    <m.div className={`faq__item faq__item--${accent} ${open ? 'is-open' : ''}`.trim()} variants={riseItem}>
      <h3 className="faq__heading">
        <button
          type="button"
          id={buttonId}
          className="faq__trigger"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
        >
          <span className="faq__icon" aria-hidden="true">
            <Icon name={item.icon} size={18} />
          </span>
          <span className="faq__question">{item.question}</span>
          <Icon name="chevronDown" size={20} className="faq__chevron" />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="panel"
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            className="faq__panel"
            variants={accordionBody}
            initial="collapsed"
            animate="open"
            exit="collapsed"
            transition={reduceMotion ? { duration: 0 } : undefined}
          >
            <p>{item.answer}</p>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

export function FaqSection() {
  // Satu pertanyaan terbuka dalam satu waktu (accordion "single collapsible").
  const [openIndex, setOpenIndex] = useState(null);
  const reduceMotion = prefersReducedMotion();
  return (
    <section className="section section--tinted" aria-labelledby="faq-title">
      <div className="container container--narrow">
        <div className="section__header" {...aos('fade-up')}>
          <p className="eyebrow">
            <Icon name="help" size={16} /> Pertanyaan umum
          </p>
          <h2 id="faq-title" className="section__title">
            Yang sering <span className="text-gradient">ditanyakan</span>
          </h2>
        </div>
        <m.div className="faq" variants={staggerList} {...revealOnScroll()}>
          {FAQ.map((item, index) => (
            <FaqItem
              key={item.question}
              item={item}
              accent={FAQ_ACCENTS[index % FAQ_ACCENTS.length]}
              open={openIndex === index}
              onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
              reduceMotion={reduceMotion}
            />
          ))}
        </m.div>
      </div>
    </section>
  );
}

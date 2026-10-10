import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import Icon from '../../components/ui/Icon.jsx';
import { ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useResource } from '../../hooks/useResource.js';
import { createElection, getElection, updateElection } from '../../services/adminApi.js';
import { showApiError, showSuccessToast } from '../../utils/alerts.js';
import { deviceTimeZone, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../utils/format.js';

const EMPTY = { title: '', description: '', startAt: '', endAt: '', eligibleVoterCount: '', resultsPublic: false };

function toFormValues(election) {
  return {
    title: election.title,
    description: election.description ?? '',
    startAt: toDateTimeLocalValue(election.startAt),
    endAt: toDateTimeLocalValue(election.endAt),
    eligibleVoterCount: election.eligibleVoterCount ? String(election.eligibleVoterCount) : '',
    resultsPublic: election.resultsPublic,
  };
}

function toPayload(values) {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    startAt: fromDateTimeLocalValue(values.startAt),
    endAt: fromDateTimeLocalValue(values.endAt),
    eligibleVoterCount: values.eligibleVoterCount === '' ? null : Number(values.eligibleVoterCount),
    resultsPublic: values.resultsPublic,
  };
}

function validate(values) {
  const errors = {};
  const title = values.title.trim();
  if (title.length < 5) errors.title = 'Judul minimal 5 karakter.';
  else if (title.length > 150) errors.title = 'Judul maksimal 150 karakter.';
  if (values.description.length > 2000) errors.description = 'Deskripsi maksimal 2000 karakter.';
  if (!values.startAt) errors.startAt = 'Waktu mulai wajib diisi.';
  if (!values.endAt) errors.endAt = 'Waktu selesai wajib diisi.';
  if (values.startAt && values.endAt && new Date(values.endAt) <= new Date(values.startAt)) {
    errors.endAt = 'Waktu selesai harus setelah waktu mulai.';
  }
  if (values.eligibleVoterCount !== '') {
    const count = Number(values.eligibleVoterCount);
    if (!Number.isInteger(count) || count < 1) errors.eligibleVoterCount = 'Isi dengan bilangan bulat minimal 1, atau kosongkan.';
  }
  return errors;
}

function ElectionForm({ election, onSaved }) {
  const editing = Boolean(election);
  const initial = editing ? toFormValues(election) : EMPTY;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const startLocked = editing && (election.status === 'active' || election.status === 'completed');
  const endLocked = editing && election.status === 'completed';

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const problems = validate(values);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById(`election-${Object.keys(problems)[0]}`)?.focus();
      return;
    }
    let payload = toPayload(values);
    if (editing) {
      // Kirim hanya kolom yang berubah agar kolom yang terkunci tidak ikut dikirim.
      const before = toPayload(initial);
      payload = Object.fromEntries(Object.entries(payload).filter(([key, value]) => before[key] !== value));
      if (Object.keys(payload).length === 0) {
        onSaved(election, false);
        return;
      }
    }
    setSaving(true);
    try {
      const saved = editing ? await updateElection(election.id, payload) : await createElection(payload);
      onSaved(saved, true);
    } catch (problem) {
      if (problem.code === 'VALIDATION_ERROR' && problem.details?.length) {
        setErrors(Object.fromEntries(problem.details.filter((d) => d.field).map((d) => [d.field, d.message])));
      }
      await showApiError(problem, 'Pemilihan gagal disimpan');
    } finally {
      setSaving(false);
    }
  }

  const field = (name) => ({
    id: `election-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `election-${name}-error` : `election-${name}-help`,
  });
  const error = (name) =>
    errors[name] && (
      <p id={`election-${name}-error`} className="field__error" role="alert">
        <Icon name="alert" size={16} /> {errors[name]}
      </p>
    );

  return (
    <form className="card form-card" onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className={`field ${errors.title ? 'field--invalid' : ''}`}>
        <label className="field__label" htmlFor="election-title">
          Judul pemilihan
        </label>
        <input {...field('title')} type="text" value={values.title} onChange={set('title')} maxLength={150} disabled={saving} />
        <p id="election-title-help" className="field__help">
          Contoh: Pemilihan Ketua &amp; Wakil Ketua OSIS 2026/2027
        </p>
        {error('title')}
      </div>

      <div className={`field ${errors.description ? 'field--invalid' : ''}`}>
        <label className="field__label" htmlFor="election-description">
          Deskripsi <span className="field__optional">(opsional)</span>
        </label>
        <textarea {...field('description')} rows={3} value={values.description} onChange={set('description')} disabled={saving} />
        <p id="election-description-help" className="field__help">
          Ditampilkan di halaman publik.
        </p>
        {error('description')}
      </div>

      <div className="form-grid">
        <div className={`field ${errors.startAt ? 'field--invalid' : ''}`}>
          <label className="field__label" htmlFor="election-startAt">
            Waktu mulai
          </label>
          <input {...field('startAt')} type="datetime-local" value={values.startAt} onChange={set('startAt')} disabled={saving || startLocked} />
          <p id="election-startAt-help" className="field__help">
            {startLocked ? 'Dikunci karena pemungutan suara sudah dibuka.' : `Zona waktu perangkat: ${deviceTimeZone()}`}
          </p>
          {error('startAt')}
        </div>
        <div className={`field ${errors.endAt ? 'field--invalid' : ''}`}>
          <label className="field__label" htmlFor="election-endAt">
            Waktu selesai
          </label>
          <input {...field('endAt')} type="datetime-local" value={values.endAt} onChange={set('endAt')} disabled={saving || endLocked} />
          <p id="election-endAt-help" className="field__help">
            {endLocked ? 'Pemilihan sudah selesai.' : 'Saat pemilihan aktif, waktu selesai masih dapat diperpanjang.'}
          </p>
          {error('endAt')}
        </div>
      </div>

      <div className={`field ${errors.eligibleVoterCount ? 'field--invalid' : ''}`}>
        <label className="field__label" htmlFor="election-eligibleVoterCount">
          Jumlah siswa berhak pilih <span className="field__optional">(opsional)</span>
        </label>
        <input
          {...field('eligibleVoterCount')}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={values.eligibleVoterCount}
          onChange={set('eligibleVoterCount')}
          disabled={saving}
        />
        <p id="election-eligibleVoterCount-help" className="field__help">
          Angka resmi dari sekolah, dipakai sebagai penyebut persentase partisipasi. Kosongkan bila belum ada — sistem
          tidak akan menebak jumlah siswa.
        </p>
        {error('eligibleVoterCount')}
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={values.resultsPublic} onChange={set('resultsPublic')} disabled={saving} />
        <span>
          <strong>Publikasikan hasil</strong>
          <span className="field__help">Hasil hanya tampil ke publik setelah pemilihan berstatus selesai.</span>
        </span>
      </label>

      <div className="form-actions">
        <Link to="/admin/pemilihan" className="btn btn--ghost">
          Batal
        </Link>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="check" size={18} />}
          {saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Buat pemilihan'}
        </button>
      </div>
    </form>
  );
}

export default function ElectionFormPage() {
  const { electionId } = useParams();
  const editing = Boolean(electionId);
  useDocumentTitle(editing ? 'Ubah Pemilihan' : 'Buat Pemilihan');
  const navigate = useNavigate();
  const { data, error, loading, reload } = useResource(
    (signal) => (electionId ? getElection(electionId, signal) : Promise.resolve(null)),
    [electionId],
  );

  function handleSaved(election, changed) {
    if (changed) showSuccessToast(editing ? 'Perubahan disimpan.' : 'Pemilihan dibuat. Tambahkan pasangan calon.');
    navigate(editing ? '/admin/pemilihan' : `/admin/pemilihan/${election.id}/kandidat`);
  }

  return (
    <div className="admin-page admin-page--narrow">
      <Link to="/admin/pemilihan" className="back-link">
        <Icon name="arrowLeft" size={16} /> Daftar pemilihan
      </Link>
      <header className="admin-page__header">
        <h1 className="admin-page__title">{editing ? 'Ubah pemilihan' : 'Buat pemilihan baru'}</h1>
      </header>
      {loading && <LoadingState />}
      {!loading && error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && (!editing || data) && <ElectionForm key={data?.id ?? 'new'} election={data} onSaved={handleSaved} />}
    </div>
  );
}

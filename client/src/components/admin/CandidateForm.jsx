import { useEffect, useRef, useState } from 'react';
import { publicUrl } from '../../config/appConfig.js';
import Icon from '../ui/Icon.jsx';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function initialValues(candidate, nextNumber) {
  return {
    candidateNumber: String(candidate?.candidateNumber ?? nextNumber),
    chairpersonName: candidate?.chairpersonName ?? '',
    viceChairpersonName: candidate?.viceChairpersonName ?? '',
    vision: candidate?.vision ?? '',
    mission: candidate?.mission ?? '',
    photoUrl: candidate?.photoUrl && /^https:\/\//.test(candidate.photoUrl) ? candidate.photoUrl : '',
  };
}

function validate(values, file) {
  const errors = {};
  const number = Number(values.candidateNumber);
  if (!Number.isInteger(number) || number < 1 || number > 99) errors.candidateNumber = 'Nomor urut 1–99.';
  if (values.chairpersonName.trim().length < 3) errors.chairpersonName = 'Nama Ketua minimal 3 karakter.';
  if (values.viceChairpersonName.trim().length < 3) errors.viceChairpersonName = 'Nama Wakil Ketua minimal 3 karakter.';
  if (values.vision.trim().length < 10) errors.vision = 'Visi minimal 10 karakter.';
  if (values.mission.trim().length < 10) errors.mission = 'Misi minimal 10 karakter.';
  if (values.photoUrl && !/^https:\/\/\S+$/.test(values.photoUrl.trim())) errors.photoUrl = 'URL foto harus diawali https://';
  if (file && !PHOTO_TYPES.includes(file.type)) errors.photo = 'Foto harus berformat JPG, PNG, atau WebP.';
  else if (file && file.size > MAX_PHOTO_BYTES) errors.photo = 'Ukuran foto maksimal 2 MB.';
  return errors;
}

/**
 * Formulir pasangan calon. `onSubmit(payload, file)` dikerjakan halaman induk
 * (simpan data JSON, lalu unggah foto bila ada).
 */
export default function CandidateForm({ candidate, nextNumber, onSubmit, onCancel, saving, serverErrors }) {
  const [values, setValues] = useState(() => initialValues(candidate, nextNumber));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const previewUrlRef = useRef(null);
  const shownErrors = { ...errors, ...serverErrors };

  // URL pratinjau (blob:) dilepas saat diganti atau saat formulir ditutup.
  useEffect(() => () => previewUrlRef.current && URL.revokeObjectURL(previewUrlRef.current), []);

  function chooseFile(nextFile) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextFile ? URL.createObjectURL(nextFile) : null;
    setFile(nextFile);
    setPreview(previewUrlRef.current);
    setErrors(({ photo: _removed, ...rest }) => rest);
  }

  const set = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const problems = validate(values, file);
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById(`candidate-${Object.keys(problems)[0]}`)?.focus();
      return;
    }
    const payload = {
      candidateNumber: Number(values.candidateNumber),
      chairpersonName: values.chairpersonName.trim(),
      viceChairpersonName: values.viceChairpersonName.trim(),
      vision: values.vision.trim(),
      mission: values.mission.trim(),
    };
    if (values.photoUrl.trim()) payload.photoUrl = values.photoUrl.trim();
    onSubmit(payload, file);
  }

  const describe = (name, help) => ({
    id: `candidate-${name}`,
    'aria-invalid': Boolean(shownErrors[name]),
    'aria-describedby': shownErrors[name] ? `candidate-${name}-error` : help ? `candidate-${name}-help` : undefined,
  });
  const error = (name) =>
    shownErrors[name] && (
      <p id={`candidate-${name}-error`} className="field__error" role="alert">
        <Icon name="alert" size={16} /> {shownErrors[name]}
      </p>
    );

  return (
    <form id="candidate-form" className="form-stack" onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className="form-grid form-grid--number">
        <div className={`field ${shownErrors.candidateNumber ? 'field--invalid' : ''}`}>
          <label className="field__label" htmlFor="candidate-candidateNumber">
            Nomor urut
          </label>
          <input {...describe('candidateNumber')} type="number" min={1} max={99} value={values.candidateNumber} onChange={set('candidateNumber')} disabled={saving} />
          {error('candidateNumber')}
        </div>
        <div className={`field ${shownErrors.chairpersonName ? 'field--invalid' : ''}`}>
          <label className="field__label" htmlFor="candidate-chairpersonName">
            Nama calon Ketua
          </label>
          <input {...describe('chairpersonName')} type="text" maxLength={100} value={values.chairpersonName} onChange={set('chairpersonName')} disabled={saving} />
          {error('chairpersonName')}
        </div>
      </div>
      <div className={`field ${shownErrors.viceChairpersonName ? 'field--invalid' : ''}`}>
        <label className="field__label" htmlFor="candidate-viceChairpersonName">
          Nama calon Wakil Ketua
        </label>
        <input
          {...describe('viceChairpersonName')}
          type="text"
          maxLength={100}
          value={values.viceChairpersonName}
          onChange={set('viceChairpersonName')}
          disabled={saving}
        />
        {error('viceChairpersonName')}
      </div>
      <div className={`field ${shownErrors.vision ? 'field--invalid' : ''}`}>
        <label className="field__label" htmlFor="candidate-vision">
          Visi
        </label>
        <textarea {...describe('vision')} rows={3} maxLength={2000} value={values.vision} onChange={set('vision')} disabled={saving} />
        {error('vision')}
      </div>
      <div className={`field ${shownErrors.mission ? 'field--invalid' : ''}`}>
        <label className="field__label" htmlFor="candidate-mission">
          Misi
        </label>
        <textarea {...describe('mission', true)} rows={5} maxLength={5000} value={values.mission} onChange={set('mission')} disabled={saving} />
        <p id="candidate-mission-help" className="field__help">
          Tulis satu misi per baris.
        </p>
        {error('mission')}
      </div>

      <fieldset className="field photo-field">
        <legend className="field__label">Foto pasangan calon (opsional)</legend>
        <div className="photo-field__row">
          {(preview || candidate?.photoUrl) && (
            <img className="photo-field__preview" src={preview ?? publicUrl(candidate.photoUrl)} alt="Pratinjau foto pasangan calon" />
          )}
          <div className="photo-field__inputs">
            <label className="btn btn--secondary btn--sm file-button">
              <Icon name="upload" size={16} /> {file ? 'Ganti file' : 'Pilih file foto'}
              <input
                id="candidate-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={saving}
                aria-describedby="candidate-photo-help"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <p id="candidate-photo-help" className="field__help">
              {file
                ? `${file.name} (${Math.round(file.size / 1024)} KB)`
                : 'JPG, PNG, atau WebP, maksimal 2 MB. Disarankan PNG berlatar transparan agar logo sekolah tampil di belakang paslon.'}
            </p>
            {error('photo')}
            <label className="field__label field__label--small" htmlFor="candidate-photoUrl">
              atau URL foto (https://)
            </label>
            <input {...describe('photoUrl')} type="url" inputMode="url" value={values.photoUrl} onChange={set('photoUrl')} disabled={saving || Boolean(file)} placeholder="https://" />
            {error('photoUrl')}
          </div>
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Batal
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="check" size={18} />}
          {saving ? 'Menyimpan…' : candidate ? 'Simpan perubahan' : 'Tambah pasangan calon'}
        </button>
      </div>
    </form>
  );
}

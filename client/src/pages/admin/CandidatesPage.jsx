import { useState } from 'react';
import { Link, useParams } from 'react-router';
import CandidateForm from '../../components/admin/CandidateForm.jsx';
import CandidateAvatar from '../../components/candidates/CandidateAvatar.jsx';
import { MissionList } from '../../components/candidates/CandidateDetail.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useResource } from '../../hooks/useResource.js';
import {
  createCandidate,
  deleteCandidate,
  getElection,
  listCandidates,
  updateCandidate,
  uploadCandidatePhoto,
} from '../../services/adminApi.js';
import { confirmDeleteCandidate, showApiError, showSuccessToast } from '../../utils/alerts.js';
import { formatCandidateNumber } from '../../utils/election.js';
import { formatDateTime } from '../../utils/format.js';

async function loadPage(electionId, signal) {
  const [election, candidates] = await Promise.all([getElection(electionId, signal), listCandidates(electionId, signal)]);
  return { election, candidates };
}

export default function CandidatesPage() {
  const { electionId } = useParams();
  useDocumentTitle('Pasangan Calon');
  const { can } = useAuth();
  const { data, error, loading, reload } = useResource((signal) => loadPage(electionId, signal), [electionId]);
  const [editor, setEditor] = useState(null); // { candidate | null }
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [busyId, setBusyId] = useState(null);

  const election = data?.election;
  const candidates = data?.candidates ?? [];
  const editable = Boolean(election?.candidatesEditable) && can('candidates:manage');
  const nextNumber = candidates.reduce((max, candidate) => Math.max(max, candidate.candidateNumber), 0) + 1;

  function closeEditor() {
    if (saving) return;
    setEditor(null);
    setServerErrors({});
  }

  async function handleSubmit(payload, file) {
    setSaving(true);
    setServerErrors({});
    let saved;
    try {
      saved = editor.candidate
        ? await updateCandidate(editor.candidate.id, payload)
        : await createCandidate(electionId, payload);
    } catch (problem) {
      setSaving(false);
      if (problem.code === 'VALIDATION_ERROR' && problem.details?.length) {
        setServerErrors(Object.fromEntries(problem.details.filter((d) => d.field).map((d) => [d.field, d.message])));
      } else if (problem.code === 'CANDIDATE_NUMBER_TAKEN') {
        setServerErrors({ candidateNumber: problem.message });
      }
      await showApiError(problem, 'Data pasangan calon gagal disimpan');
      return;
    }

    if (file) {
      try {
        await uploadCandidatePhoto(saved.id, file);
      } catch (problem) {
        setSaving(false);
        setEditor(null);
        await reload();
        await showApiError(problem, 'Data tersimpan, tetapi foto gagal diunggah');
        return;
      }
    }
    setSaving(false);
    setEditor(null);
    showSuccessToast(editor.candidate ? 'Pasangan calon diperbarui.' : 'Pasangan calon ditambahkan.');
    await reload();
  }

  async function handleDelete(candidate) {
    if (busyId || !(await confirmDeleteCandidate(candidate))) return;
    setBusyId(candidate.id);
    try {
      await deleteCandidate(candidate.id);
      showSuccessToast('Pasangan calon dihapus.');
      await reload();
    } catch (problem) {
      await showApiError(problem, 'Pasangan calon gagal dihapus');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page">
      <Link to="/admin/pemilihan" className="back-link">
        <Icon name="arrowLeft" size={16} /> Daftar pemilihan
      </Link>

      {loading && <LoadingState message="Memuat pasangan calon…" />}
      {!loading && error && <ErrorState error={error} onRetry={reload} />}

      {election && (
        <>
          <header className="admin-page__header">
            <div>
              <StatusBadge phase={election.phase} />
              <h1 className="admin-page__title">Pasangan calon</h1>
              <p className="muted">
                {election.title} · {formatDateTime(election.startAt)}
              </p>
            </div>
            {editable && (
              <button type="button" className="btn btn--primary" onClick={() => setEditor({ candidate: null })}>
                <Icon name="plus" size={18} /> Tambah pasangan calon
              </button>
            )}
          </header>

          {!election.candidatesEditable && (
            <p className="notice notice--info" role="status">
              <Icon name="lock" size={18} />
              Data pasangan calon dikunci karena pemungutan suara sudah dibuka atau selesai, demi menjaga integritas
              pemilihan.
            </p>
          )}

          {candidates.length === 0 ? (
            <EmptyState icon="users" title="Belum ada pasangan calon">
              {editable ? 'Tambahkan minimal satu pasangan calon sebelum membuka pemungutan suara.' : 'Belum ada data.'}
            </EmptyState>
          ) : (
            <ul className="admin-candidates">
              {candidates.map((candidate) => (
                <li key={candidate.id} className="card admin-candidate" aria-busy={busyId === candidate.id}>
                  <CandidateAvatar candidate={candidate} size="lg" />
                  <div className="admin-candidate__body">
                    <p className="eyebrow">Nomor urut {formatCandidateNumber(candidate.candidateNumber)}</p>
                    <h2 className="admin-candidate__names">
                      {candidate.chairpersonName} &amp; {candidate.viceChairpersonName}
                    </h2>
                    <p className="admin-candidate__vision">{candidate.vision}</p>
                    <details className="admin-candidate__mission">
                      <summary>Lihat misi</summary>
                      <MissionList mission={candidate.mission} />
                    </details>
                  </div>
                  {editable && (
                    <div className="admin-candidate__actions">
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setEditor({ candidate })}>
                        <Icon name="edit" size={16} /> Ubah
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--danger-text"
                        disabled={busyId === candidate.id}
                        onClick={() => handleDelete(candidate)}
                      >
                        <Icon name="trash" size={16} /> Hapus
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={Boolean(editor)}
        onClose={closeEditor}
        title={editor?.candidate ? 'Ubah pasangan calon' : 'Tambah pasangan calon'}
        description={election?.title}
        size="lg"
      >
        {editor && (
          <CandidateForm
            key={editor.candidate?.id ?? 'new'}
            candidate={editor.candidate}
            nextNumber={nextNumber}
            onSubmit={handleSubmit}
            onCancel={closeEditor}
            saving={saving}
            serverErrors={serverErrors}
          />
        )}
      </Dialog>
    </div>
  );
}

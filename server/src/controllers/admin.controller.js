import * as auditService from '../services/audit.service.js';
import * as candidateService from '../services/candidate.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as electionService from '../services/election.service.js';
import * as resultsService from '../services/results.service.js';
import { Errors } from '../utils/errors.js';

export function createAdminController(config) {
  const uploadsDir = config.uploads.dir;
  const actor = (req) => req.auth.user;

  return {
    async dashboard(req, res) {
      res.json({ data: await dashboardService.getDashboard(req.valid.query), meta: { serverTime: new Date() } });
    },

    async listElections(req, res) {
      const { items, meta } = await electionService.listElections(req.valid.query);
      res.json({ data: items, meta });
    },

    async getElection(req, res) {
      res.json({ data: await electionService.getElectionForAdmin(req.valid.params.id) });
    },

    async createElection(req, res) {
      const election = await electionService.createElection(req.valid.body, actor(req));
      res.status(201).json({ data: election, message: 'Pemilihan berhasil dibuat.' });
    },

    async updateElection(req, res) {
      const election = await electionService.updateElection(req.valid.params.id, req.valid.body, actor(req));
      res.json({ data: election, message: 'Pemilihan berhasil diperbarui.' });
    },

    async deleteElection(req, res) {
      await electionService.deleteElection(req.valid.params.id, actor(req), uploadsDir);
      res.status(204).end();
    },

    async listCandidates(req, res) {
      res.json({ data: await candidateService.listCandidatesForAdmin(req.valid.params.id) });
    },

    async createCandidate(req, res) {
      const candidate = await candidateService.createCandidate(req.valid.params.id, req.valid.body, actor(req));
      res.status(201).json({ data: candidate, message: 'Pasangan calon berhasil ditambahkan.' });
    },

    async updateCandidate(req, res) {
      const candidate = await candidateService.updateCandidate(req.valid.params.id, req.valid.body, actor(req));
      res.json({ data: candidate, message: 'Pasangan calon berhasil diperbarui.' });
    },

    async deleteCandidate(req, res) {
      await candidateService.deleteCandidate(req.valid.params.id, actor(req), uploadsDir);
      res.status(204).end();
    },

    async uploadCandidatePhoto(req, res) {
      if (!req.file) throw Errors.invalidImage('Pilih file foto pada field "photo".');
      const candidate = await candidateService.updateCandidatePhoto(
        req.valid.params.id,
        req.file.buffer,
        actor(req),
        uploadsDir,
      );
      res.json({ data: candidate, message: 'Foto pasangan calon berhasil diperbarui.' });
    },

    async getResults(req, res) {
      res.json({ data: await resultsService.getAdminResults(req.valid.params.id) });
    },

    async listAuditLogs(req, res) {
      const { items, meta } = await auditService.listAuditLogs(req.valid.query);
      res.json({ data: items, meta });
    },

    async listElectionAuditLogs(req, res) {
      await electionService.getElectionForAdmin(req.valid.params.id); // 404 jika tidak ada
      const { items, meta } = await auditService.listAuditLogs({ ...req.valid.query, electionId: req.valid.params.id });
      res.json({ data: items, meta });
    },
  };
}

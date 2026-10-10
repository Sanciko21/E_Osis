import express from 'express';
import multer from 'multer';
import { getPool } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createAdminController } from '../controllers/admin.controller.js';
import { createAuthController } from '../controllers/auth.controller.js';
import * as publicController from '../controllers/public.controller.js';
import { optionalAuth, requireAuth, requireCsrf, requirePermission } from '../middleware/auth.js';
import { createRateLimiters } from '../middleware/rateLimiters.js';
import { requireJsonBody, validate } from '../middleware/validate.js';
import { auditLogQuery, dashboardQuery, electionAuditLogQuery } from '../validators/admin.validators.js';
import { loginSchema } from '../validators/auth.validators.js';
import { createCandidateSchema, updateCandidateSchema } from '../validators/candidate.validators.js';
import { idParams } from '../validators/common.js';
import { createElectionSchema, listElectionsQuery, updateElectionSchema } from '../validators/election.validators.js';
import { createVoteSchema } from '../validators/vote.validators.js';

function publicRoutes(limiters, voteSchema) {
  const router = express.Router();
  router.get('/current', publicController.getCurrentElection);
  router.get('/active', publicController.getActiveElection);
  router.get('/:id', validate({ params: idParams }), publicController.getElection);
  router.get('/:id/candidates', validate({ params: idParams }), publicController.listCandidates);
  router.get('/:id/results', validate({ params: idParams }), publicController.getResults);
  router.post(
    '/:id/vote',
    limiters.vote,
    requireJsonBody,
    validate({ params: idParams, body: voteSchema }),
    publicController.castVote,
  );
  return router;
}

function authRoutes(config, limiters) {
  const router = express.Router();
  const controller = createAuthController(config.session);
  router.post('/login', limiters.login, requireJsonBody, validate({ body: loginSchema }), controller.login);
  router.post('/logout', optionalAuth(config.session), controller.logout);
  router.get('/me', requireAuth(config.session), controller.me);
  return router;
}

function adminRoutes(config) {
  const router = express.Router();
  const controller = createAdminController(config);
  const can = requirePermission;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 0, parts: 2 },
  });

  // Semua endpoint admin: wajib login + token CSRF untuk method yang mengubah data.
  router.use(requireAuth(config.session), requireCsrf);

  // Upload foto memakai multipart/form-data, didaftarkan sebelum pemeriksaan JSON.
  router.put(
    '/candidates/:id/photo',
    can(PERMISSIONS.CANDIDATES_MANAGE),
    validate({ params: idParams }),
    upload.single('photo'),
    controller.uploadCandidatePhoto,
  );
  router.use(requireJsonBody);

  router.get('/dashboard', can(PERMISSIONS.DASHBOARD_VIEW), validate({ query: dashboardQuery }), controller.dashboard);

  router.get('/elections', can(PERMISSIONS.ELECTIONS_VIEW), validate({ query: listElectionsQuery }), controller.listElections);
  router.post('/elections', can(PERMISSIONS.ELECTIONS_MANAGE), validate({ body: createElectionSchema }), controller.createElection);
  router.get('/elections/:id', can(PERMISSIONS.ELECTIONS_VIEW), validate({ params: idParams }), controller.getElection);
  router.patch(
    '/elections/:id',
    can(PERMISSIONS.ELECTIONS_MANAGE),
    validate({ params: idParams, body: updateElectionSchema }),
    controller.updateElection,
  );
  router.delete('/elections/:id', can(PERMISSIONS.ELECTIONS_MANAGE), validate({ params: idParams }), controller.deleteElection);

  router.get('/elections/:id/candidates', can(PERMISSIONS.ELECTIONS_VIEW), validate({ params: idParams }), controller.listCandidates);
  router.post(
    '/elections/:id/candidates',
    can(PERMISSIONS.CANDIDATES_MANAGE),
    validate({ params: idParams, body: createCandidateSchema }),
    controller.createCandidate,
  );
  router.patch(
    '/candidates/:id',
    can(PERMISSIONS.CANDIDATES_MANAGE),
    validate({ params: idParams, body: updateCandidateSchema }),
    controller.updateCandidate,
  );
  router.delete('/candidates/:id', can(PERMISSIONS.CANDIDATES_MANAGE), validate({ params: idParams }), controller.deleteCandidate);

  router.get('/elections/:id/results', can(PERMISSIONS.RESULTS_VIEW_INTERIM), validate({ params: idParams }), controller.getResults);
  router.get(
    '/elections/:id/audit-logs',
    can(PERMISSIONS.AUDIT_VIEW),
    validate({ params: idParams, query: electionAuditLogQuery }),
    controller.listElectionAuditLogs,
  );
  router.get('/audit-logs', can(PERMISSIONS.AUDIT_VIEW), validate({ query: auditLogQuery }), controller.listAuditLogs);
  return router;
}

async function health(_req, res) {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
}

export function createApiRouter(config) {
  const router = express.Router();
  const limiters = createRateLimiters(config.rateLimit);

  router.use(limiters.api);
  // Data pemilihan berubah cepat dan sebagian bersifat pribadi: jangan di-cache.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/health', health);
  router.use('/elections', publicRoutes(limiters, createVoteSchema(config.nisnPattern)));
  router.use('/auth', authRoutes(config, limiters));
  router.use('/admin', adminRoutes(config));
  return router;
}

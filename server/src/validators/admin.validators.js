import { z } from 'zod';
import { paginationQuery, uuid } from './common.js';

export const auditLogQuery = z.object({
  electionId: uuid().optional(),
  ...paginationQuery(25, 100),
});

export const electionAuditLogQuery = z.object({ ...paginationQuery(25, 100) });

export const dashboardQuery = z.object({ electionId: uuid().optional() });

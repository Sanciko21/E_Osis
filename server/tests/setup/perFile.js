import { afterAll } from 'vitest';
import { closePool } from '../../src/config/database.js';
import { closeAdminConnection } from '../helpers/db.js';

afterAll(async () => {
  await closePool();
  await closeAdminConnection();
});

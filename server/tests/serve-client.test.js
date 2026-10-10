import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './helpers/http.js';

const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eosis-dist-'));
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><div id="root"></div>');
afterAll(() => fs.rmSync(distDir, { recursive: true, force: true }));

describe('Mode satu server (SERVE_CLIENT=true)', () => {
  it('menyajikan SPA dengan fallback route, CSP ketat, dan API tetap JSON', async () => {
    const app = buildApp({ SERVE_CLIENT: 'true', CLIENT_DIST_DIR: distDir, COOKIE_SECURE: 'false' });

    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    const csp = home.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests'); // HTTP (mis. IP LAN) tetap berfungsi

    const deepLink = await request(app).get('/admin/pemilihan');
    expect(deepLink.status).toBe(200);
    expect(deepLink.text).toContain('<div id="root">');

    const api = await request(app).get('/api/tidak-ada');
    expect(api.status).toBe(404);
    expect(api.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('deployment HTTPS menambahkan upgrade-insecure-requests', async () => {
    const app = buildApp({ SERVE_CLIENT: 'true', CLIENT_DIST_DIR: distDir, COOKIE_SECURE: 'true' });
    const home = await request(app).get('/');
    expect(home.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});

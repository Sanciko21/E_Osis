import request from 'supertest';
import { createApp } from '../../src/app.js';
import { buildConfig, getConfig } from '../../src/config/env.js';

/** Aplikasi Express untuk tes; `envOverrides` dipakai untuk menguji konfigurasi khusus. */
export function buildApp(envOverrides) {
  const config = envOverrides ? buildConfig({ ...process.env, ...envOverrides }) : getConfig();
  return createApp({ config });
}

/** Login sebagai admin dan kembalikan agent (menyimpan cookie) + token CSRF. */
export async function loginAs(app, admin) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email: admin.email, password: admin.password });
  if (response.status !== 200) {
    throw new Error(`Login gagal (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return { agent, csrfToken: response.body.data.csrfToken, user: response.body.data.user, response };
}

export function vote(app, electionId, body) {
  return request(app).post(`/api/elections/${electionId}/vote`).send(body);
}

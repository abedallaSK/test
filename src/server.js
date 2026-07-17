/**
 * Activity Bot server — serves the settings UI and a small JSON API, and boots
 * the scheduler. Strapi tokens never leave the server (the UI talks to these
 * proxy endpoints, not to Strapi directly).
 *
 * Multi-environment: most endpoints take an `env` id (query ?env= or body.env);
 * it defaults to the first configured environment.
 */

import './loadenv.js'; // MUST be first — loads .env before any module reads process.env

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { getConfig, updateConfig, ACTIVITY_TYPES } from './config.js';
import { getLogs, log } from './logger.js';
import { runOnce, reschedule } from './scheduler.js';
import { getUsers, getDojos, getPushTargets } from './strapi.js';
import { sendExpoPush, isExpoPushToken } from './expo.js';
import { listEnvironments, resolveEnv, defaultEnvId, addEnvironment, removeEnvironment } from './environments.js';
import { statePath } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Bumped whenever server-side behaviour changes. Surfaced to the UI so you can
// confirm the RUNNING process (not just static files) is the latest.
const BUILD = 'build-8 (persistence + env manager + 2 event schedules)';

// Simple session-based auth
const sessions = new Map(); // token -> { username, createdAt }

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isAuthenticated(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** Pick the env id from query/body, falling back to the default. */
function envIdFrom(req) {
  return req.query?.env || req.body?.env || defaultEnvId();
}

const app = express();
app.use(express.json());
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }),
);

app.get('/api/health', (req, res) => res.json({ ok: true, build: BUILD }));

/** Login endpoint */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || '';

  if (!expectedPass) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  if (username === expectedUser && password === expectedPass) {
    const token = generateSessionToken();
    sessions.set(token, { username, createdAt: Date.now() });
    res.json({ token, expiresIn: 24 * 60 * 60 * 1000 });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

/** Logout endpoint */
app.post('/api/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

/** Check auth status */
app.get('/api/auth', (req, res) => {
  if (isAuthenticated(req)) res.json({ authenticated: true });
  else res.status(401).json({ authenticated: false });
});

// Everything below requires auth.
app.use('/api', (req, res, next) => {
  // login/logout/auth/health already handled above.
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Authentication required' });
});

/** List configured environments (id + name only — never tokens). */
app.get('/api/environments', (req, res) => {
  res.json({ environments: listEnvironments(), defaultEnv: defaultEnvId() });
});

/** Add a new environment. Body: { name, url, token }. Persisted to disk. */
app.post('/api/environments', (req, res) => {
  try {
    const { name, url, token } = req.body || {};
    const added = addEnvironment({ name, url, token });
    reschedule();
    res.json({ added, environments: listEnvironments(), defaultEnv: defaultEnvId() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Remove an environment (and its saved config). */
app.delete('/api/environments/:id', (req, res) => {
  try {
    removeEnvironment(req.params.id);
    reschedule();
    res.json({ environments: listEnvironments(), defaultEnv: defaultEnvId() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    res.json(await getUsers(resolveEnv(envIdFrom(req))));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/dojos', async (req, res) => {
  try {
    res.json(await getDojos(resolveEnv(envIdFrom(req))));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  const env = resolveEnv(envIdFrom(req));
  res.json({
    ...getConfig(env.id),
    env: env.id,
    envName: env.name,
    activityTypes: ACTIVITY_TYPES,
    build: BUILD,
  });
});

app.put('/api/config', (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const { env: _ignored, ...patch } = req.body || {};
    const next = updateConfig(env.id, patch);
    reschedule();
    log('info', `[${env.name}] Config updated via UI`, { env: env.id });
    res.json({ ...next, env: env.id, envName: env.name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/run-now', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const allowed = ['activities', 'eventsTrue', 'eventsFalse', 'events'];
    const scope = allowed.includes(req.body?.scope) ? req.body.scope : 'activities';
    const result = await runOnce({ envId: env.id, manual: true, scope });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Send an Expo push notification.
 * Body: { env, title, body, mode: 'selected'|'all', userIds: number[] }
 */
app.post('/api/notify', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const { title, body, mode, userIds } = req.body || {};
    if (!String(title || '').trim() && !String(body || '').trim()) {
      return res.status(400).json({ error: 'Provide a title or a message.' });
    }

    const targets = await getPushTargets(
      env,
      mode === 'all' ? 'all' : Array.isArray(userIds) ? userIds : [],
    );
    const withToken = targets.filter((t) => isExpoPushToken(t.token));
    const skipped = targets.length - withToken.length;

    if (!withToken.length) {
      log('skip', `[${env.name}] Notification: no recipients with a valid device token`, { env: env.id, skipped });
      return res.json({ sent: 0, failed: 0, skipped, recipients: 0 });
    }

    const messages = withToken.map((t) => ({
      to: t.token,
      title: String(title || '').trim() || undefined,
      body: String(body || '').trim() || undefined,
      data: { source: 'activity-bot' },
    }));

    const result = await sendExpoPush(messages);
    log(result.failed ? 'error' : 'success',
      `[${env.name}] Push: ${result.sent} sent, ${result.failed} failed, ${skipped} skipped (no token)`,
      { env: env.id, sent: result.sent, failed: result.failed, skipped, recipients: withToken.length });

    res.json({ ...result, skipped, recipients: withToken.length });
  } catch (err) {
    log('error', `Notify failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', (req, res) => {
  // Optional ?env= filter.
  const envId = req.query?.env;
  const logs = getLogs();
  res.json(envId ? logs.filter((e) => !e.env || e.env === envId) : logs);
});

app.listen(PORT, () => {
  log('info', `Activity Bot listening on port ${PORT}`);
  const envs = listEnvironments();
  log('info', `Environments: ${envs.map((e) => e.name).join(', ') || '(none configured)'}`);
  log('info', `State persisted to: ${statePath()}`);
  try {
    reschedule();
  } catch (err) {
    log('error', `Initial scheduler setup failed: ${err.message}`);
  }
});

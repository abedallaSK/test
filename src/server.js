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
import multer from 'multer';

import { getConfig, updateConfig, ACTIVITY_TYPES } from './config.js';
import { getLogs, log } from './logger.js';
import { runOnce, reschedule } from './scheduler.js';
import { getUsers, getDojos, getPushTargets, uploadImageFromUrl, uploadFile, fetchMediaLibrary, listWhatsNew, createWhatsNew, updateWhatsNew, deleteWhatsNew } from './strapi.js';
import { sendExpoPush, isExpoPushToken } from './expo.js';
import { listEnvironments, resolveEnv, defaultEnvId, addEnvironment, removeEnvironment } from './environments.js';
import { statePath } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Bumped whenever server-side behaviour changes. Surfaced to the UI so you can
// confirm the RUNNING process (not just static files) is the latest.
const BUILD = 'build-9 (whatsnew: real error messages + /api/upload + per-env listing)';

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

/**
 * Minimal multipart/form-data parser. Returns an array of parts:
 *   { name, filename, contentType, data: Buffer }
 * Only handles what's needed for /api/upload (a few files, no nested fields).
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ctype = req.headers['content-type'] || '';
    const m = ctype.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!m) return reject(new Error('No multipart boundary in Content-Type'));
    const dashBoundary = '--' + (m[1] || m[2]).trim();

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const parts = [];
        let pos = buf.indexOf(dashBoundary);
        while (pos !== -1) {
          pos += dashBoundary.length;
          // End of multipart: boundary followed by --
          if (buf.slice(pos, pos + 2).toString() === '--') break;
          // Skip optional \r\n
          if (buf.slice(pos, pos + 2).toString() === '\r\n') pos += 2;

          const headerEnd = buf.indexOf('\r\n\r\n', pos);
          if (headerEnd === -1) break;
          const headerText = buf.slice(pos, headerEnd).toString();
          pos = headerEnd + 4;

          const nextStart = buf.indexOf(dashBoundary, pos);
          if (nextStart === -1) break;
          // Strip the trailing \r\n before the boundary
          const dataEnd = nextStart - 2;

          const headers = {};
          headerText.split('\r\n').forEach((line) => {
            const i = line.indexOf(':');
            if (i === -1) return;
            headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
          });
          const cd = headers['content-disposition'] || '';
          const name = (cd.match(/name="([^"]+)"/) || [])[1] || null;
          const filename = (cd.match(/filename="([^"]*)"/) || [])[1] || null;
          parts.push({
            name,
            filename,
            contentType: headers['content-type'] || 'application/octet-stream',
            data: buf.slice(pos, dataEnd),
          });
          pos = nextStart;
        }
        resolve(parts);
      } catch (err) { reject(err); }
    });
  });
}

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

/**
 * Multipart file upload — for the What's New drag-and-drop zone.
 * Accepts one or more files under the field name "files" (or "file").
 * Returns: [{ id, url, mime, name, size }] in Strapi order.
 */
app.post('/api/upload', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const parts = await parseMultipart(req);
    if (!parts.length) {
      return res.status(400).json({ error: 'No files in upload.' });
    }
    const uploaded = [];
    for (const p of parts) {
      if (!p.filename) continue; // skip form fields with no file
      const id = await uploadFile(env, p.data, p.filename, p.contentType);
      uploaded.push({ id, mime: p.contentType, name: p.filename, size: p.data.length });
    }
    if (!uploaded.length) {
      return res.status(400).json({ error: 'No files in upload (only form fields?).' });
    }
    res.json(uploaded);
  } catch (err) {
    log('error', `Upload failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
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

/** Upload an image from URL to Strapi media library. Returns the file id. */
app.post('/api/upload-from-url', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const { imageUrl, filename } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });
    const fileId = await uploadImageFromUrl(env, imageUrl, filename || 'upload.jpg');
    res.json({ id: fileId });
  } catch (err) {
    log('error', `Upload from URL failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** Upload files to Strapi media library. Returns array of file ids. */
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedIds = [];
    for (const file of req.files) {
      const form = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype });
      form.append('files', blob, file.originalname);
      
      const start = Date.now();
      const response = await fetch(`${env.apiBase}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}` },
        body: form,
      });
      const ms = Date.now() - start;
      const json = await response.json().catch(() => null);
      
      log(response.ok ? 'api' : 'error', `[${env.name}] POST /api/upload → ${response.status} (${ms}ms)`, {
        api: true,
        env: env.id,
        envName: env.name,
        method: 'POST',
        path: '/api/upload',
        status: response.status,
        ms,
      });
      
      if (!response.ok) {
        throw new Error(`upload failed (${response.status}): ${json?.error?.message || ''}`);
      }
      
      const id = Array.isArray(json) ? json[0]?.id : json?.id;
      if (!id) throw new Error('upload returned no file id');
      uploadedIds.push(id);
    }
    
    res.json(uploadedIds.map(id => ({ id })));
  } catch (err) {
    log('error', `File upload failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** Get all entries from What's New collection for the current environment. */
app.get('/api/whatsnew', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const list = await listWhatsNew(env);
    res.json(list);
  } catch (err) {
    log('error', `Fetch whatsnew failed: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

/** Create a new What's New entry. */
app.post('/api/whatsnew', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const { data } = req.body || {};
    if (!data || !data.version) return res.status(400).json({ error: 'version is required' });

    // Legacy: if image is provided as a URL string, upload it first.
    if (typeof data.image === 'string' && /^https?:\/\//i.test(data.image)) {
      data.image = await uploadImageFromUrl(env, data.image, 'whats-new.jpg');
    }

    const result = await createWhatsNew(env, data);
    log('api', `[${env.name}] Create whatsnew v${data.version} OK`, { env: env.id, version: data.version });
    res.json(result);
  } catch (err) {
    // Surface Strapi's real error (e.g. 405 / "Method not allowed" because
    // the role lacks create permission). Without this, the client got
    // "Unexpected token M, Method Not Allowed is not valid JSON".
    const msg = String(err.message || 'Create whatsnew failed');
    const isPerm = /method not allowed|forbidden|not allowed/i.test(msg);
    log('error', `Create whatsnew failed: ${msg}`);
    res.status(isPerm ? 403 : 500).json({
      error: msg,
      hint: isPerm
        ? 'The Strapi role for this API token does not allow CREATE on the "whats-new" content type. Open Strapi → Settings → Users & Permissions → Roles → edit the role used by your token → enable "create" under "Whats-new".'
        : undefined,
    });
  }
});

/** Update a What's New entry by documentId. */
app.put('/api/whatsnew/:documentId', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const { documentId } = req.params;
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: 'data is required' });

    if (typeof data.image === 'string' && /^https?:\/\//i.test(data.image)) {
      data.image = await uploadImageFromUrl(env, data.image, 'whats-new.jpg');
    }

    const result = await updateWhatsNew(env, documentId, data);
    log('api', `[${env.name}] Update whatsnew ${documentId} OK`, { env: env.id });
    res.json(result);
  } catch (err) {
    const msg = String(err.message || 'Update whatsnew failed');
    const isPerm = /method not allowed|forbidden|not allowed/i.test(msg);
    log('error', `Update whatsnew failed: ${msg}`);
    res.status(isPerm ? 403 : 500).json({
      error: msg,
      hint: isPerm
        ? 'The Strapi role for this API token does not allow UPDATE on the "whats-new" content type. Open Strapi → Settings → Users & Permissions → Roles → edit the role used by your token → enable "update" under "Whats-new".'
        : undefined,
    });
  }
});

/** Delete a What's New entry by documentId. */
app.delete('/api/whatsnew/:documentId', async (req, res) => {
  try {
    const env = resolveEnv(envIdFrom(req));
    const { documentId } = req.params;
    await deleteWhatsNew(env, documentId);
    log('api', `[${env.name}] Delete whatsnew ${documentId} OK`, { env: env.id });
    res.json({ ok: true });
  } catch (err) {
    log('error', `Delete whatsnew failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
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

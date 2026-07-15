/**
 * Activity Bot server — serves the settings UI and a small JSON API, and boots
 * the scheduler. The Strapi token never leaves the server (the UI talks to
 * these proxy endpoints, not to Strapi directly).
 */

import './loadenv.js'; // MUST be first — loads .env before any module reads process.env

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, updateConfig, ACTIVITY_TYPES } from './config.js';
import { getLogs, log } from './logger.js';
import { runOnce, reschedule } from './scheduler.js';
import { getUsers, getDojos, getPushTargets } from './strapi.js';
import { sendExpoPush, isExpoPushToken } from './expo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/users', async (req, res) => {
  try {
    res.json(await getUsers());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/dojos', async (req, res) => {
  try {
    res.json(await getDojos());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({ ...getConfig(), activityTypes: ACTIVITY_TYPES });
});

app.put('/api/config', (req, res) => {
  try {
    const next = updateConfig(req.body || {});
    reschedule();
    log('info', 'Config updated via UI');
    res.json(next);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/run-now', async (req, res) => {
  try {
    const result = await runOnce({ manual: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Send an Expo push notification.
 * Body: { title, body, mode: 'selected'|'all', userIds: number[] }
 * Tokens are resolved server-side and never exposed to the client.
 */
app.post('/api/notify', async (req, res) => {
  try {
    const { title, body, mode, userIds } = req.body || {};
    if (!String(title || '').trim() && !String(body || '').trim()) {
      return res.status(400).json({ error: 'Provide a title or a message.' });
    }

    const targets = await getPushTargets(
      mode === 'all' ? 'all' : Array.isArray(userIds) ? userIds : [],
    );
    const withToken = targets.filter((t) => isExpoPushToken(t.token));
    const skipped = targets.length - withToken.length;

    if (!withToken.length) {
      log('skip', 'Notification: no recipients with a valid device token', { skipped });
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
      `Push notification: ${result.sent} sent, ${result.failed} failed, ${skipped} skipped (no token)`,
      { sent: result.sent, failed: result.failed, skipped, recipients: withToken.length });

    res.json({ ...result, skipped, recipients: withToken.length });
  } catch (err) {
    log('error', `Notify failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', (req, res) => res.json(getLogs()));

app.listen(PORT, () => {
  log('info', `Activity Bot listening on port ${PORT}`);
  try {
    reschedule();
  } catch (err) {
    log('error', `Initial scheduler setup failed: ${err.message}`);
  }
});

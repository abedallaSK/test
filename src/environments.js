/**
 * Multi-environment registry, backed by the file store so environments added in
 * the UI survive a restart. Seeds from env vars on first boot:
 *
 *   STRAPI_ENVIRONMENTS=[{"name":"Production","url":"https://api.dojospaces.com","token":"..."}, ...]
 *
 * Backward compatible: if STRAPI_ENVIRONMENTS is missing it falls back to the
 * single legacy pair STRAPI_API_URL + STRAPI_TOKEN, named "Default".
 *
 * After the first boot the data file is the source of truth — env-var changes
 * are ignored (delete data/state.json to reseed). Tokens NEVER leave the server;
 * the public listEnvironments() exposes id + name only.
 */

import { log } from './logger.js';
import { getEnvironmentsRaw, setEnvironmentsRaw, deleteConfigRaw } from './store.js';

function slugify(s) {
  return (
    String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'env'
  );
}

function normalizeOrigin(raw) {
  return (raw || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

function uniqueId(desired, taken) {
  let id = slugify(desired);
  const base = id;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Build the initial environments array from env vars. */
function seedFromEnvVars() {
  let arr = [];
  const raw = (process.env.STRAPI_ENVIRONMENTS || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
      else log('error', 'STRAPI_ENVIRONMENTS must be a JSON array — ignoring.');
    } catch (err) {
      log('error', `STRAPI_ENVIRONMENTS is not valid JSON (${err.message}) — falling back to legacy vars.`);
    }
  }
  if (!arr.length) {
    const url = (process.env.STRAPI_API_URL || '').trim();
    if (url) arr = [{ name: process.env.STRAPI_ENV_NAME || 'Default', url, token: process.env.STRAPI_TOKEN }];
  }

  const taken = new Set();
  return arr
    .map((e, i) => {
      const name = String(e.name || `Env ${i + 1}`).trim();
      const id = uniqueId(e.id || name, taken);
      taken.add(id);
      return { id, name, url: (e.url || e.STRAPI_API_URL || '').trim(), token: (e.token || e.STRAPI_TOKEN || '').trim() };
    })
    .filter((e) => {
      if (!normalizeOrigin(e.url)) {
        log('error', `Environment "${e.name}" has no URL — skipping.`);
        return false;
      }
      return true;
    });
}

/** Return the persisted environments, seeding + persisting on first ever boot. */
function all() {
  let envs = getEnvironmentsRaw();
  if (envs === null || envs === undefined) {
    envs = seedFromEnvVars();
    setEnvironmentsRaw(envs); // persist the seed so it becomes editable
  }
  return envs;
}

function decorate(e) {
  const origin = normalizeOrigin(e.url);
  return { id: e.id, name: e.name, url: e.url, origin, apiBase: origin ? `${origin}/api` : '', token: e.token || '' };
}

/** Public list for the UI — id + name only. */
export function listEnvironments() {
  return all().map(({ id, name }) => ({ id, name }));
}

export function environmentIds() {
  return all().map((e) => e.id);
}

export function defaultEnvId() {
  return all()[0]?.id;
}

/** Resolve a full environment (with token) by id; falls back to the first. */
export function resolveEnv(id) {
  const envs = all();
  if (!envs.length) {
    throw new Error('No Strapi environment configured. Add one in the UI or set STRAPI_ENVIRONMENTS.');
  }
  const e = envs.find((x) => x.id === id) || envs[0];
  return decorate(e);
}

/** Add a new environment. Returns { id, name }. Throws on bad input. */
export function addEnvironment({ name, url, token } = {}) {
  const envs = all();
  const cleanUrl = (url || '').trim();
  if (!normalizeOrigin(cleanUrl)) throw new Error('A valid URL is required');
  if (!String(token || '').trim()) throw new Error('An API token is required');

  const taken = new Set(envs.map((e) => e.id));
  const cleanName = String(name || '').trim() || `Env ${envs.length + 1}`;
  const id = uniqueId(cleanName, taken);
  const entry = { id, name: cleanName, url: cleanUrl, token: String(token).trim() };
  envs.push(entry);
  setEnvironmentsRaw(envs);
  log('info', `Environment added: ${cleanName}`, { env: id });
  return { id, name: cleanName };
}

/** Remove an environment (and its saved config). Keeps at least one. */
export function removeEnvironment(id) {
  const envs = all();
  if (envs.length <= 1) throw new Error('Cannot remove the last environment');
  if (!envs.find((e) => e.id === id)) throw new Error('Environment not found');
  setEnvironmentsRaw(envs.filter((e) => e.id !== id));
  deleteConfigRaw(id);
  log('info', `Environment removed`, { env: id });
}

/**
 * Tiny file-backed persistence for environments + per-env configs, so settings
 * survive a restart ("run again"). State is a single JSON file:
 *
 *   { environments: [{id,name,url,token}] | null, configs: { [envId]: {...} } }
 *
 * Location: DATA_DIR/state.json (DATA_DIR defaults to <project>/data).
 * The file holds Strapi tokens, so `data/` is git-ignored. Delete it to reset
 * everything back to the environment-variable defaults.
 *
 * On a read-only filesystem (or if writes fail) the app still runs — it just
 * keeps state in memory for the process lifetime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'state.json');

let state = null;
let warnedWrite = false;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    state = { environments: null, configs: {} };
  }
  if (!state || typeof state !== 'object') state = { environments: null, configs: {} };
  if (!state.configs || typeof state.configs !== 'object') state.configs = {};
  if (state.environments !== null && !Array.isArray(state.environments)) state.environments = null;
  return state;
}

export function persist() {
  const s = load();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  } catch (err) {
    if (!warnedWrite) {
      warnedWrite = true;
      log('error', `Could not persist state to ${FILE} (${err.message}). Running in-memory only.`);
    }
  }
}

export function statePath() {
  return FILE;
}

/* ---------- environments ---------- */

export function getEnvironmentsRaw() {
  return load().environments;
}
export function setEnvironmentsRaw(arr) {
  load().environments = arr;
  persist();
}

/* ---------- configs ---------- */

export function getConfigsRaw() {
  return load().configs;
}
export function saveConfigRaw(envId, cfg) {
  load().configs[envId] = cfg;
  persist();
}
export function deleteConfigRaw(envId) {
  delete load().configs[envId];
  persist();
}

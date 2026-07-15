/**
 * Minimal, zero-dependency .env loader. Reads KEY=VALUE lines from a .env file
 * in the project root (if it exists) and sets process.env — WITHOUT overriding
 * variables already provided by the platform (e.g. Railway). A no-op when no
 * .env file is present, so it's safe in production containers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '..', '.env');

function loadEnv() {
  let raw;
  try {
    raw = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    return; // no .env — rely on real environment variables
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue; // platform vars win

    let value = trimmed.slice(eq + 1).trim();
    // Strip matching surrounding quotes, if any.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Run on import (as a side effect) so this must be the FIRST import in the
// entrypoint — env is then populated before any module reads process.env.
loadEnv();

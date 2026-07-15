/**
 * In-memory ring buffer of recent run entries, surfaced to the settings UI.
 * Not persisted — resets when the process restarts (matches the in-memory
 * config decision).
 */

const MAX_ENTRIES = 100;
const entries = [];

/**
 * @param {'success'|'error'|'skip'|'info'} level
 * @param {string} message
 * @param {object} [details]
 */
export function log(level, message, details = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...details,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

  const line = `[${entry.time}] ${level.toUpperCase()}: ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);

  return entry;
}

export function getLogs() {
  return entries;
}

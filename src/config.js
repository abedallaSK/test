/**
 * In-memory config, seeded from environment defaults on boot. The settings UI
 * mutates it at runtime; a redeploy/restart resets it to the env defaults.
 *
 * The Strapi base URL + token are NOT part of this object — they live in env
 * only (STRAPI_API_URL / STRAPI_TOKEN) and never leave the server.
 */

const ACTIVITY_TYPES = ['EVENT', 'CLASS', 'CUSTOM'];

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  enabled: bool(process.env.ENABLED, false),
  cron: process.env.DEFAULT_CRON || '*/30 * * * *',
  durationMinutes: int(process.env.DEFAULT_DURATION_MINUTES, 30),
  minMembers: int(process.env.DEFAULT_MIN_MEMBERS, 1),
  maxMembers: int(process.env.DEFAULT_MAX_MEMBERS, 3),
  selectedUserIds: [],
  activityType: ACTIVITY_TYPES.includes(process.env.DEFAULT_ACTIVITY_TYPE)
    ? process.env.DEFAULT_ACTIVITY_TYPE
    : 'CUSTOM',
  autoEnd: bool(process.env.AUTO_END, true),
  attachDojo: bool(process.env.ATTACH_DOJO, true),
};

export function getConfig() {
  return { ...config, selectedUserIds: [...config.selectedUserIds] };
}

/**
 * Validate + merge a partial update. Returns the new config; throws Error with
 * a user-facing message on invalid input.
 */
export function updateConfig(patch = {}) {
  const next = { ...config };

  if ('enabled' in patch) next.enabled = Boolean(patch.enabled);
  if ('autoEnd' in patch) next.autoEnd = Boolean(patch.autoEnd);
  if ('attachDojo' in patch) next.attachDojo = Boolean(patch.attachDojo);

  if ('cron' in patch) {
    if (typeof patch.cron !== 'string' || !patch.cron.trim()) {
      throw new Error('cron must be a non-empty string');
    }
    next.cron = patch.cron.trim();
  }

  if ('durationMinutes' in patch) {
    const d = Number(patch.durationMinutes);
    if (!Number.isFinite(d) || d < 1) throw new Error('durationMinutes must be >= 1');
    next.durationMinutes = Math.floor(d);
  }

  if ('minMembers' in patch) {
    const m = Number(patch.minMembers);
    if (!Number.isFinite(m) || m < 0) throw new Error('minMembers must be >= 0');
    next.minMembers = Math.floor(m);
  }

  if ('maxMembers' in patch) {
    const m = Number(patch.maxMembers);
    if (!Number.isFinite(m) || m < 0) throw new Error('maxMembers must be >= 0');
    next.maxMembers = Math.floor(m);
  }

  if (next.maxMembers < next.minMembers) {
    throw new Error('maxMembers must be >= minMembers');
  }

  if ('activityType' in patch) {
    if (!ACTIVITY_TYPES.includes(patch.activityType)) {
      throw new Error(`activityType must be one of ${ACTIVITY_TYPES.join(', ')}`);
    }
    next.activityType = patch.activityType;
  }

  if ('selectedUserIds' in patch) {
    if (!Array.isArray(patch.selectedUserIds)) {
      throw new Error('selectedUserIds must be an array');
    }
    const ids = patch.selectedUserIds
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => Number.isFinite(n));
    next.selectedUserIds = Array.from(new Set(ids));
  }

  Object.assign(config, next);
  return getConfig();
}

export { ACTIVITY_TYPES };

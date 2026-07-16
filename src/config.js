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

const DEFAULT_EVENT_TITLES = [
  'Sunrise Yoga Session',
  'Community Run',
  'Meditation Meetup',
  'Beach Workout',
  'Evening Cycling',
  'Group Hike',
  'Martial Arts Class',
  'Mindfulness Workshop',
  'Street Basketball',
  'Morning Stretch',
];

const DEFAULT_EVENT_DESCRIPTIONS = [
  'Join us for a refreshing session open to all levels — bring water and good vibes!',
  'Meet fellow members for a fun group activity in the heart of the city.',
  'A relaxing gathering to recharge body and mind. Everyone is welcome.',
  "Let's move together, stay healthy, and make new friends along the way.",
  'A guided session designed for beginners and pros alike. See you there!',
];

function lines(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const arr = value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : fallback;
}

const config = {
  enabled: bool(process.env.ENABLED, false),
  cron: process.env.DEFAULT_CRON || '*/30 * * * *',

  // --- activities ---
  activitiesEnabled: bool(process.env.ACTIVITIES_ENABLED, true),
  // Duration is a random range (minutes). Each activity picks its own value.
  minDurationMinutes: int(
    process.env.DEFAULT_MIN_DURATION_MINUTES,
    int(process.env.DEFAULT_DURATION_MINUTES, 30),
  ),
  maxDurationMinutes: int(
    process.env.DEFAULT_MAX_DURATION_MINUTES,
    Math.max(int(process.env.DEFAULT_DURATION_MINUTES, 30), 60),
  ),
  minMembers: int(process.env.DEFAULT_MIN_MEMBERS, 1),
  maxMembers: int(process.env.DEFAULT_MAX_MEMBERS, 3),
  minActivities: int(process.env.DEFAULT_MIN_ACTIVITIES, 1),
  maxActivities: int(process.env.DEFAULT_MAX_ACTIVITIES, 1),
  activityType: ACTIVITY_TYPES.includes(process.env.DEFAULT_ACTIVITY_TYPE)
    ? process.env.DEFAULT_ACTIVITY_TYPE
    : 'CUSTOM',
  autoEnd: bool(process.env.AUTO_END, true),
  attachDojo: bool(process.env.ATTACH_DOJO, true),

  // --- events (created in the same run, sharing the user pool) ---
  eventsEnabled: bool(process.env.EVENTS_ENABLED, false),
  minEvents: int(process.env.DEFAULT_MIN_EVENTS, 1),
  maxEvents: int(process.env.DEFAULT_MAX_EVENTS, 2),
  // % of created events with isEvent=true. Default 100 so "create event" makes
  // real events — an isEvent=false record shows up as an ACTIVITY in the app.
  eventIsEventRatio: int(process.env.DEFAULT_EVENT_IS_EVENT_RATIO, 100),
  eventFutureMinDays: int(process.env.DEFAULT_EVENT_FUTURE_MIN_DAYS, 1),
  eventFutureMaxDays: int(process.env.DEFAULT_EVENT_FUTURE_MAX_DAYS, 30),
  eventDurationMinutes: int(process.env.DEFAULT_EVENT_DURATION_MINUTES, 120),
  eventAttachPhoto: bool(process.env.EVENT_ATTACH_PHOTO, true),
  eventAttachDojo: bool(process.env.EVENT_ATTACH_DOJO, true),
  eventTitles: lines(process.env.DEFAULT_EVENT_TITLES, DEFAULT_EVENT_TITLES),
  eventDescriptions: lines(process.env.DEFAULT_EVENT_DESCRIPTIONS, DEFAULT_EVENT_DESCRIPTIONS),

  selectedUserIds: [],
};

export function getConfig() {
  return {
    ...config,
    selectedUserIds: [...config.selectedUserIds],
    eventTitles: [...config.eventTitles],
    eventDescriptions: [...config.eventDescriptions],
  };
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
  if ('activitiesEnabled' in patch) next.activitiesEnabled = Boolean(patch.activitiesEnabled);
  if ('eventsEnabled' in patch) next.eventsEnabled = Boolean(patch.eventsEnabled);
  if ('eventAttachPhoto' in patch) next.eventAttachPhoto = Boolean(patch.eventAttachPhoto);
  if ('eventAttachDojo' in patch) next.eventAttachDojo = Boolean(patch.eventAttachDojo);

  if ('cron' in patch) {
    if (typeof patch.cron !== 'string' || !patch.cron.trim()) {
      throw new Error('cron must be a non-empty string');
    }
    next.cron = patch.cron.trim();
  }

  if ('minDurationMinutes' in patch) {
    const d = Number(patch.minDurationMinutes);
    if (!Number.isFinite(d) || d < 1) throw new Error('minDurationMinutes must be >= 1');
    next.minDurationMinutes = Math.floor(d);
  }
  if ('maxDurationMinutes' in patch) {
    const d = Number(patch.maxDurationMinutes);
    if (!Number.isFinite(d) || d < 1) throw new Error('maxDurationMinutes must be >= 1');
    next.maxDurationMinutes = Math.floor(d);
  }
  if (next.maxDurationMinutes < next.minDurationMinutes) {
    throw new Error('maxDurationMinutes must be >= minDurationMinutes');
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

  if ('minActivities' in patch) {
    const m = Number(patch.minActivities);
    if (!Number.isFinite(m) || m < 1) throw new Error('minActivities must be >= 1');
    next.minActivities = Math.floor(m);
  }

  if ('maxActivities' in patch) {
    const m = Number(patch.maxActivities);
    if (!Number.isFinite(m) || m < 1) throw new Error('maxActivities must be >= 1');
    next.maxActivities = Math.floor(m);
  }

  if (next.maxMembers < next.minMembers) {
    throw new Error('maxMembers must be >= minMembers');
  }

  if (next.maxActivities < next.minActivities) {
    throw new Error('maxActivities must be >= minActivities');
  }

  // --- event numeric fields ---
  const intField = (key, min, label) => {
    if (!(key in patch)) return;
    const v = Number(patch[key]);
    if (!Number.isFinite(v) || v < min) throw new Error(`${label} must be >= ${min}`);
    next[key] = Math.floor(v);
  };
  intField('minEvents', 0, 'minEvents');
  intField('maxEvents', 0, 'maxEvents');
  intField('eventFutureMinDays', 0, 'eventFutureMinDays');
  intField('eventFutureMaxDays', 0, 'eventFutureMaxDays');
  intField('eventDurationMinutes', 1, 'eventDurationMinutes');

  if ('eventIsEventRatio' in patch) {
    const v = Number(patch.eventIsEventRatio);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error('eventIsEventRatio must be between 0 and 100');
    }
    next.eventIsEventRatio = Math.floor(v);
  }

  if (next.maxEvents < next.minEvents) {
    throw new Error('maxEvents must be >= minEvents');
  }
  if (next.eventFutureMaxDays < next.eventFutureMinDays) {
    throw new Error('eventFutureMaxDays must be >= eventFutureMinDays');
  }

  const linesField = (key) => {
    if (!(key in patch)) return;
    const val = patch[key];
    const arr = Array.isArray(val)
      ? val.map((s) => String(s).trim()).filter(Boolean)
      : String(val).split('\n').map((s) => s.trim()).filter(Boolean);
    if (!arr.length) throw new Error(`${key} must have at least one entry`);
    next[key] = arr;
  };
  linesField('eventTitles');
  linesField('eventDescriptions');

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

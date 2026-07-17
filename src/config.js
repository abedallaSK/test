/**
 * Per-environment config, backed by the file store so edits survive a restart.
 * Each Strapi environment keeps its OWN config (schedule, user pool, event
 * settings). Seeded from env-var DEFAULT_* the first time an env is touched,
 * then the persisted value wins.
 *
 * THREE independent schedules per environment:
 *   - activitiesEnabled + activityCron         → Activities cron
 *   - eventsTrueEnabled + eventsTrueCron       → Events cron  (isEvent = true, 100%)
 *   - eventsFalseEnabled + eventsFalseCron     → Events cron  (isEvent = false, 0%)
 */

import { getConfigsRaw, saveConfigRaw } from './store.js';

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
  'Sunrise Yoga Session', 'Community Run', 'Meditation Meetup', 'Beach Workout',
  'Evening Cycling', 'Group Hike', 'Martial Arts Class', 'Mindfulness Workshop',
  'Street Basketball', 'Morning Stretch',
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
  const arr = value.split('\n').map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : fallback;
}

/** A fresh config seeded from process env defaults. */
function seedConfig() {
  return {
    // --- activities schedule ---
    activitiesEnabled: bool(process.env.ACTIVITIES_SCHEDULE_ENABLED, bool(process.env.ENABLED, false)),
    activityCron: process.env.DEFAULT_ACTIVITY_CRON || process.env.DEFAULT_CRON || '*/30 * * * *',

    // --- events schedule: isEvent = true (100%) ---
    eventsTrueEnabled: bool(process.env.EVENTS_SCHEDULE_ENABLED, bool(process.env.EVENTS_ENABLED, false)),
    eventsTrueCron: process.env.DEFAULT_EVENT_CRON || '0 */6 * * *',
    eventsTrueMin: int(process.env.DEFAULT_MIN_EVENTS, 1),
    eventsTrueMax: int(process.env.DEFAULT_MAX_EVENTS, 2),

    // --- events schedule: isEvent = false (0%) — shows as ACTIVITIES in the app ---
    eventsFalseEnabled: false,
    eventsFalseCron: process.env.DEFAULT_EVENT_FALSE_CRON || '0 */12 * * *',
    eventsFalseMin: int(process.env.DEFAULT_MIN_EVENTS_FALSE, 1),
    eventsFalseMax: int(process.env.DEFAULT_MAX_EVENTS_FALSE, 1),

    // --- activity settings ---
    minDurationMinutes: int(process.env.DEFAULT_MIN_DURATION_MINUTES, int(process.env.DEFAULT_DURATION_MINUTES, 30)),
    maxDurationMinutes: int(process.env.DEFAULT_MAX_DURATION_MINUTES, Math.max(int(process.env.DEFAULT_DURATION_MINUTES, 30), 60)),
    minMembers: int(process.env.DEFAULT_MIN_MEMBERS, 1),
    maxMembers: int(process.env.DEFAULT_MAX_MEMBERS, 3),
    minActivities: int(process.env.DEFAULT_MIN_ACTIVITIES, 1),
    maxActivities: int(process.env.DEFAULT_MAX_ACTIVITIES, 1),
    activityType: ACTIVITY_TYPES.includes(process.env.DEFAULT_ACTIVITY_TYPE) ? process.env.DEFAULT_ACTIVITY_TYPE : 'CUSTOM',
    autoEnd: bool(process.env.AUTO_END, true),
    attachDojo: bool(process.env.ATTACH_DOJO, true),

    // --- shared event settings ---
    eventFutureMinDays: int(process.env.DEFAULT_EVENT_FUTURE_MIN_DAYS, 1),
    eventFutureMaxDays: int(process.env.DEFAULT_EVENT_FUTURE_MAX_DAYS, 30),
    eventDurationMinutes: int(process.env.DEFAULT_EVENT_DURATION_MINUTES, 120),
    eventAttachPhoto: bool(process.env.EVENT_ATTACH_PHOTO, true),
    eventAttachDojo: bool(process.env.EVENT_ATTACH_DOJO, true),
    eventTitles: lines(process.env.DEFAULT_EVENT_TITLES, DEFAULT_EVENT_TITLES),
    eventDescriptions: lines(process.env.DEFAULT_EVENT_DESCRIPTIONS, DEFAULT_EVENT_DESCRIPTIONS),

    selectedUserIds: [],
  };
}

// Track which env configs have been normalized this process (fill gaps once).
const normalized = new Set();

function baseFor(envId) {
  const configs = getConfigsRaw();
  const key = envId || '__default__';
  if (!configs[key]) {
    configs[key] = seedConfig();
    saveConfigRaw(key, configs[key]);
  } else if (!normalized.has(key)) {
    // Fill any fields missing from an older persisted config (persisted wins).
    configs[key] = { ...seedConfig(), ...configs[key] };
    saveConfigRaw(key, configs[key]);
  }
  normalized.add(key);
  return configs[key];
}

export function getConfig(envId) {
  const c = baseFor(envId);
  return {
    ...c,
    selectedUserIds: [...(c.selectedUserIds || [])],
    eventTitles: [...(c.eventTitles || [])],
    eventDescriptions: [...(c.eventDescriptions || [])],
  };
}

/**
 * Validate + merge a partial update for one environment, then persist.
 * Throws Error with a user-facing message on invalid input.
 */
export function updateConfig(envId, patch = {}) {
  const key = envId || '__default__';
  const current = baseFor(envId);
  const next = { ...current };

  const boolFields = [
    'activitiesEnabled', 'eventsTrueEnabled', 'eventsFalseEnabled',
    'autoEnd', 'attachDojo', 'eventAttachPhoto', 'eventAttachDojo',
  ];
  for (const f of boolFields) if (f in patch) next[f] = Boolean(patch[f]);

  const cronField = (field) => {
    if (!(field in patch)) return;
    if (typeof patch[field] !== 'string' || !patch[field].trim()) {
      throw new Error(`${field} must be a non-empty string`);
    }
    next[field] = patch[field].trim();
  };
  cronField('activityCron');
  cronField('eventsTrueCron');
  cronField('eventsFalseCron');

  const minField = (field, min, label) => {
    if (!(field in patch)) return;
    const v = Number(patch[field]);
    if (!Number.isFinite(v) || v < min) throw new Error(`${label} must be >= ${min}`);
    next[field] = Math.floor(v);
  };
  minField('minDurationMinutes', 1, 'minDurationMinutes');
  minField('maxDurationMinutes', 1, 'maxDurationMinutes');
  minField('minMembers', 0, 'minMembers');
  minField('maxMembers', 0, 'maxMembers');
  minField('minActivities', 1, 'minActivities');
  minField('maxActivities', 1, 'maxActivities');
  minField('eventsTrueMin', 0, 'eventsTrueMin');
  minField('eventsTrueMax', 0, 'eventsTrueMax');
  minField('eventsFalseMin', 0, 'eventsFalseMin');
  minField('eventsFalseMax', 0, 'eventsFalseMax');
  minField('eventFutureMinDays', 0, 'eventFutureMinDays');
  minField('eventFutureMaxDays', 0, 'eventFutureMaxDays');
  minField('eventDurationMinutes', 1, 'eventDurationMinutes');

  const range = (minKey, maxKey, label) => {
    if (next[maxKey] < next[minKey]) throw new Error(`${label} max must be >= min`);
  };
  range('minDurationMinutes', 'maxDurationMinutes', 'duration');
  range('minMembers', 'maxMembers', 'members');
  range('minActivities', 'maxActivities', 'activities');
  range('eventsTrueMin', 'eventsTrueMax', 'events (isEvent=true)');
  range('eventsFalseMin', 'eventsFalseMax', 'events (isEvent=false)');
  range('eventFutureMinDays', 'eventFutureMaxDays', 'start window');

  const linesField = (field) => {
    if (!(field in patch)) return;
    const val = patch[field];
    const arr = Array.isArray(val)
      ? val.map((s) => String(s).trim()).filter(Boolean)
      : String(val).split('\n').map((s) => s.trim()).filter(Boolean);
    if (!arr.length) throw new Error(`${field} must have at least one entry`);
    next[field] = arr;
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
    if (!Array.isArray(patch.selectedUserIds)) throw new Error('selectedUserIds must be an array');
    const ids = patch.selectedUserIds.map((v) => Number.parseInt(v, 10)).filter((n) => Number.isFinite(n));
    next.selectedUserIds = Array.from(new Set(ids));
  }

  Object.assign(current, next);
  saveConfigRaw(key, current);
  return getConfig(envId);
}

export { ACTIVITY_TYPES };

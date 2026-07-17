/**
 * Owns the cron jobs. Each Strapi environment gets THREE independent schedules:
 *   - Activities cron                → activities + members (optional auto-end)
 *   - Events cron (isEvent = true)   → real events (100%)
 *   - Events cron (isEvent = false)  → records that show as ACTIVITIES (0%)
 *
 * runOnce() is also used for manual "Run now" from the UI.
 */

import cron from 'node-cron';
import { getConfig } from './config.js';
import { log } from './logger.js';
import { resolveEnv, environmentIds } from './environments.js';
import { randomIsraeliLocation, randomIsraeliPlaceName } from './locations.js';
import {
  getUsers, getDojos, createActivity, createActivityMember, endActivity, createEvent, uploadImageFromUrl,
} from './strapi.js';

const TIMEZONE = 'Asia/Jerusalem';

// key `${envId}:${kind}` -> cron task, kind in activities|eventsTrue|eventsFalse
const tasks = new Map();
const userNameCaches = new Map();

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function refreshUserNames(env, ids) {
  try {
    const users = await getUsers(env);
    userNameCaches.set(env.id, new Map(users.map((u) => [u.id, u.name])));
  } catch { /* best-effort */ }
  const cache = userNameCaches.get(env.id) || new Map();
  return ids.map((id) => cache.get(id) || `#${id}`);
}

/**
 * Run one creation cycle for a single environment.
 * @param {object} opts
 * @param {string} opts.envId
 * @param {boolean} [opts.manual]
 * @param {'activities'|'eventsTrue'|'eventsFalse'|'events'} [opts.scope]
 *   'events' (manual only) runs BOTH event streams.
 */
export async function runOnce({ envId, manual = false, scope = 'activities' } = {}) {
  const env = resolveEnv(envId);
  const cfg = getConfig(env.id);

  if (cfg.selectedUserIds.length === 0) {
    log('skip', `[${env.name}] No users selected — nothing to create`, { env: env.id, manual });
    return { skipped: true, reason: 'no-users' };
  }

  const doActivities = scope === 'activities';
  const doEventsTrue = scope === 'eventsTrue' || scope === 'events';
  const doEventsFalse = scope === 'eventsFalse' || scope === 'events';

  const activitiesCreated = doActivities ? await createActivitiesBatch(env, cfg, { manual }) : [];
  let eventsCreated = [];
  if (doEventsTrue) {
    eventsCreated = eventsCreated.concat(
      await createEventsBatch(env, cfg, { isEvent: true, min: cfg.eventsTrueMin, max: cfg.eventsTrueMax }),
    );
  }
  if (doEventsFalse) {
    eventsCreated = eventsCreated.concat(
      await createEventsBatch(env, cfg, { isEvent: false, min: cfg.eventsFalseMin, max: cfg.eventsFalseMax }),
    );
  }

  const totalMembers = activitiesCreated.reduce((s, a) => s + a.memberCount, 0);
  return {
    ok: activitiesCreated.length > 0 || eventsCreated.length > 0,
    env: env.id,
    activitiesCreated: activitiesCreated.length,
    totalMembers,
    activityIds: activitiesCreated.map((a) => a.id),
    eventsCreated: eventsCreated.length,
    eventIds: eventsCreated.map((e) => e.id),
  };
}

async function createActivitiesBatch(env, cfg, { manual = false } = {}) {
  const numActivities = randInt(cfg.minActivities, cfg.maxActivities);
  const activitiesCreated = [];

  for (let actIdx = 0; actIdx < numActivities; actIdx++) {
    const poolShuffled = shuffle([...cfg.selectedUserIds]);
    const hostId = poolShuffled[0];
    const others = poolShuffled.slice(1);
    const wantedMembers = Math.min(randInt(cfg.minMembers, cfg.maxMembers), others.length);
    const memberIds = others.slice(0, wantedMembers);

    const location = randomIsraeliLocation();
    const nowIso = new Date().toISOString();
    const durationMinutes = randInt(cfg.minDurationMinutes, cfg.maxDurationMinutes);
    const durationMs = durationMinutes * 60 * 1000;

    let dojoId = null;
    if (cfg.attachDojo) {
      try {
        const dojos = await getDojos(env);
        if (dojos.length) dojoId = pick(dojos).id;
      } catch (err) {
        log('info', `[${env.name}] Could not fetch dojos, continuing without one: ${err.message}`, { env: env.id });
      }
    }

    try {
      const activityData = {
        user: hostId, startTime: nowIso, duration: durationMs, activityType: cfg.activityType,
        sessionStatus: 'active', visibleOnMap: true, publicChatEnabled: true, location,
      };
      if (dojoId != null) activityData.dojo = dojoId;

      const { id, documentId } = await createActivity(env, activityData);
      await createActivityMember(env, { activity: id, user: hostId, joinTime: nowIso, memberStatus: 'active', isHost: true });
      for (const memberId of memberIds) {
        await createActivityMember(env, { activity: id, user: memberId, joinTime: nowIso, memberStatus: 'active', isHost: false });
      }

      const [hostName, ...memberNames] = await refreshUserNames(env, [hostId, ...memberIds]);
      log('success', `[${env.name}] Created activity #${id} in ${location.name}`, {
        env: env.id, activityId: id, documentId, host: hostName, members: memberNames,
        memberCount: memberIds.length, dojoId, location, activityType: cfg.activityType,
        durationMinutes, manual, activityNumber: actIdx + 1, totalActivities: numActivities,
      });

      activitiesCreated.push({ id, documentId, memberCount: memberIds.length });

      if (cfg.autoEnd && documentId) {
        setTimeout(async () => {
          try {
            await endActivity(env, documentId, new Date().toISOString());
            log('info', `[${env.name}] Auto-ended activity #${id} after ${durationMinutes} min`, { env: env.id, activityId: id });
          } catch (err) {
            log('error', `[${env.name}] Failed to auto-end activity #${id}: ${err.message}`, { env: env.id, activityId: id });
          }
        }, durationMs);
      }
    } catch (err) {
      log('error', `[${env.name}] Activity ${actIdx + 1} creation failed: ${err.message}`, { env: env.id, manual });
    }
  }

  return activitiesCreated;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create a batch of events with a FORCED isEvent value. */
async function createEventsBatch(env, cfg, { isEvent, min, max }) {
  const numEvents = randInt(min, max);
  const created = [];

  for (let i = 0; i < numEvents; i++) {
    try {
      const owner = pick(cfg.selectedUserIds);
      const title = pick(cfg.eventTitles);
      const description = pick(cfg.eventDescriptions);
      const locationName = randomIsraeliPlaceName();

      const daysAhead = randInt(cfg.eventFutureMinDays, cfg.eventFutureMaxDays);
      const startMs = Date.now() + daysAhead * DAY_MS + Math.floor(Math.random() * DAY_MS);
      const startTime = new Date(startMs).toISOString();
      const endTime = new Date(startMs + cfg.eventDurationMinutes * 60 * 1000).toISOString();

      let dojoId = null;
      if (cfg.eventAttachDojo) {
        try {
          const dojos = await getDojos(env);
          if (dojos.length) dojoId = pick(dojos).id;
        } catch (err) {
          log('info', `[${env.name}] Could not fetch dojos for event, continuing: ${err.message}`, { env: env.id });
        }
      }

      let imageId = null;
      if (cfg.eventAttachPhoto) {
        try {
          const seed = `evt${Date.now()}-${i}`;
          imageId = await uploadImageFromUrl(env, `https://picsum.photos/seed/${seed}/800/600`, `event-${seed}.jpg`);
        } catch (err) {
          log('info', `[${env.name}] Event photo skipped: ${err.message}`, { env: env.id });
        }
      }

      const data = { title, description, startTime, endTime, isEvent, location: locationName, owner };
      if (dojoId != null) data.dojo = dojoId;
      if (imageId != null) data.eventImage = imageId;

      const { id, documentId } = await createEvent(env, data);
      const [ownerName] = await refreshUserNames(env, [owner]);

      log('success', `[${env.name}] Created ${isEvent ? 'event' : 'activity-type event'} #${id}: "${title}"`, {
        env: env.id, eventId: id, documentId, owner: ownerName, isEvent,
        location: { name: locationName }, dojoId, hasPhoto: imageId != null, startTime, endTime,
      });
      created.push({ id, documentId, isEvent });
    } catch (err) {
      log('error', `[${env.name}] Event ${i + 1} (isEvent=${isEvent}) creation failed: ${err.message}`, { env: env.id });
    }
  }

  return created;
}

function stopAllTasks() {
  for (const task of tasks.values()) task.stop();
  tasks.clear();
}

function armTask(env, kind, label, cronExpr) {
  if (!cron.validate(cronExpr)) {
    log('error', `[${env.name}] Invalid ${label} cron, not armed: "${cronExpr}"`, { env: env.id });
    return false;
  }
  const task = cron.schedule(
    cronExpr,
    () => {
      runOnce({ envId: env.id, scope: kind }).catch((err) =>
        log('error', `[${env.name}] ${label} run threw: ${err.message}`, { env: env.id }),
      );
    },
    { timezone: TIMEZONE },
  );
  tasks.set(`${env.id}:${kind}`, task);
  log('info', `[${env.name}] ${label} scheduler armed: "${cronExpr}" (${TIMEZONE})`, { env: env.id });
  return true;
}

/** (Re)build ALL cron jobs across every environment. Call after any change. */
export function reschedule() {
  stopAllTasks();
  const ids = environmentIds();
  if (!ids.length) { log('error', 'No Strapi environments configured — scheduler idle.'); return; }

  let armed = 0;
  for (const id of ids) {
    const env = resolveEnv(id);
    const cfg = getConfig(id);
    if (cfg.activitiesEnabled) armed += armTask(env, 'activities', 'activities', cfg.activityCron) ? 1 : 0;
    if (cfg.eventsTrueEnabled) armed += armTask(env, 'eventsTrue', 'events (isEvent=true)', cfg.eventsTrueCron) ? 1 : 0;
    if (cfg.eventsFalseEnabled) armed += armTask(env, 'eventsFalse', 'events (isEvent=false)', cfg.eventsFalseCron) ? 1 : 0;
  }
  if (!armed) log('info', 'No schedules enabled — scheduler idle (Run now still works).');
}

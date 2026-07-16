/**
 * Owns the cron job and the single-run logic that creates a dummy activity plus
 * its member rows, and (when autoEnd is on) auto-ends it after the timer.
 */

import cron from 'node-cron';
import { getConfig } from './config.js';
import { log } from './logger.js';
import { randomIsraeliLocation, randomIsraeliPlaceName } from './locations.js';
import {
  getUsers,
  getDojos,
  createActivity,
  createActivityMember,
  endActivity,
  createEvent,
  uploadImageFromUrl,
} from './strapi.js';

const TIMEZONE = 'Asia/Jerusalem';

let task = null;
// name lookup cache so the run log can show host/member names, refreshed lazily.
let userNameCache = new Map();

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function refreshUserNames(ids) {
  try {
    const users = await getUsers();
    userNameCache = new Map(users.map((u) => [u.id, u.name]));
  } catch {
    // best-effort; ids will just render as numbers in the log
  }
  return ids.map((id) => userNameCache.get(id) || `#${id}`);
}

/**
 * Run one creation cycle. Returns a summary.
 * @param {object} opts
 * @param {boolean} [opts.manual] - true for a UI-triggered run.
 * @param {'all'|'activities'|'events'} [opts.scope] - what to create.
 *   'all' (scheduled) respects the enable toggles; 'activities'/'events'
 *   (a scoped manual test) force that kind regardless of its toggle.
 */
export async function runOnce({ manual = false, scope = 'all' } = {}) {
  const cfg = getConfig();

  if (!cfg.enabled && !manual) {
    log('skip', 'Scheduler fired but bot is disabled');
    return { skipped: true, reason: 'disabled' };
  }
  if (cfg.selectedUserIds.length === 0) {
    log('skip', 'No users selected — nothing to create', { manual });
    return { skipped: true, reason: 'no-users' };
  }

  const doActivities = scope === 'activities' || (scope === 'all' && cfg.activitiesEnabled);
  const doEvents = scope === 'events' || (scope === 'all' && cfg.eventsEnabled);

  if (!doActivities && !doEvents) {
    log('skip', 'Nothing enabled for this run', { manual, scope });
    return { skipped: true, reason: 'nothing-enabled' };
  }

  const activitiesCreated = doActivities ? await createActivitiesBatch(cfg, { manual }) : [];
  const eventsCreated = doEvents ? await createEventsBatch(cfg) : [];

  const totalMembers = activitiesCreated.reduce((s, a) => s + a.memberCount, 0);
  return {
    ok: activitiesCreated.length > 0 || eventsCreated.length > 0,
    activitiesCreated: activitiesCreated.length,
    totalMembers,
    activityIds: activitiesCreated.map((a) => a.id),
    eventsCreated: eventsCreated.length,
    eventIds: eventsCreated.map((e) => e.id),
  };
}

/** Create the run's activities. Each activity independently samples a host plus
 *  a random member count between min and max from the selected pool. */
async function createActivitiesBatch(cfg, { manual = false } = {}) {
  const numActivities = randInt(cfg.minActivities, cfg.maxActivities);
  const activitiesCreated = [];

  for (let actIdx = 0; actIdx < numActivities; actIdx++) {
    // Re-shuffle the full pool for each activity so member count is honoured
    // independently (a user may appear in more than one activity in a run).
    const poolShuffled = shuffle([...cfg.selectedUserIds]);
    const hostId = poolShuffled[0];
    const others = poolShuffled.slice(1);

    // Random member count in [minMembers, maxMembers], clamped to how many
    // OTHER users exist (can't add more members than we have users).
    const wantedMembers = Math.min(
      randInt(cfg.minMembers, cfg.maxMembers),
      others.length,
    );
    const memberIds = others.slice(0, wantedMembers);

    const location = randomIsraeliLocation();
    const nowIso = new Date().toISOString();
    // Random duration in [minDurationMinutes, maxDurationMinutes].
    const durationMinutes = randInt(cfg.minDurationMinutes, cfg.maxDurationMinutes);
    const durationMs = durationMinutes * 60 * 1000;

    let dojoId = null;
    if (cfg.attachDojo) {
      try {
        const dojos = await getDojos();
        if (dojos.length) dojoId = pick(dojos).id;
      } catch (err) {
        log('info', `Could not fetch dojos, continuing without one: ${err.message}`);
      }
    }

    try {
      const activityData = {
        user: hostId,
        startTime: nowIso,
        duration: durationMs,
        activityType: cfg.activityType,
        sessionStatus: 'active',
        visibleOnMap: true,
        publicChatEnabled: true,
        location,
      };
      if (dojoId != null) activityData.dojo = dojoId;

      const { id, documentId } = await createActivity(activityData);

      // Host member first (isHost), then each participant.
      await createActivityMember({
        activity: id,
        user: hostId,
        joinTime: nowIso,
        memberStatus: 'active',
        isHost: true,
      });
      for (const memberId of memberIds) {
        await createActivityMember({
          activity: id,
          user: memberId,
          joinTime: nowIso,
          memberStatus: 'active',
          isHost: false,
        });
      }

      const [hostName, ...memberNames] = await refreshUserNames([hostId, ...memberIds]);

      log('success', `Created activity #${id} in ${location.name}`, {
        activityId: id,
        documentId,
        host: hostName,
        members: memberNames,
        memberCount: memberIds.length,
        dojoId,
        location,
        activityType: cfg.activityType,
        durationMinutes,
        manual,
        activityNumber: actIdx + 1,
        totalActivities: numActivities,
      });

      activitiesCreated.push({ id, documentId, memberCount: memberIds.length });

      // Auto-end after the timer (best-effort; only while the process is alive).
      if (cfg.autoEnd && documentId) {
        setTimeout(async () => {
          try {
            await endActivity(documentId, new Date().toISOString());
            log('info', `Auto-ended activity #${id} after ${durationMinutes} min`, {
              activityId: id,
            });
          } catch (err) {
            log('error', `Failed to auto-end activity #${id}: ${err.message}`, {
              activityId: id,
            });
          }
        }, durationMs);
      }
    } catch (err) {
      log('error', `Activity ${actIdx + 1} creation failed: ${err.message}`, { manual });
      // Continue with next activity instead of failing entirely
    }
  }

  return activitiesCreated;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create the run's events, sharing the selected-users pool as owners. */
async function createEventsBatch(cfg) {
  const numEvents = randInt(cfg.minEvents, cfg.maxEvents);
  const created = [];

  for (let i = 0; i < numEvents; i++) {
    try {
      const owner = pick(cfg.selectedUserIds);
      const title = pick(cfg.eventTitles);
      const description = pick(cfg.eventDescriptions);
      const isEvent = Math.random() * 100 < cfg.eventIsEventRatio;
      const locationName = randomIsraeliPlaceName();

      // startTime strictly in the future
      const daysAhead = randInt(cfg.eventFutureMinDays, cfg.eventFutureMaxDays);
      const startMs = Date.now() + daysAhead * DAY_MS + Math.floor(Math.random() * DAY_MS);
      const startTime = new Date(startMs).toISOString();
      const endTime = new Date(startMs + cfg.eventDurationMinutes * 60 * 1000).toISOString();

      let dojoId = null;
      if (cfg.eventAttachDojo) {
        try {
          const dojos = await getDojos();
          if (dojos.length) dojoId = pick(dojos).id;
        } catch (err) {
          log('info', `Could not fetch dojos for event, continuing: ${err.message}`);
        }
      }

      let imageId = null;
      if (cfg.eventAttachPhoto) {
        try {
          const seed = `evt${Date.now()}-${i}`;
          imageId = await uploadImageFromUrl(
            `https://picsum.photos/seed/${seed}/800/600`,
            `event-${seed}.jpg`,
          );
        } catch (err) {
          log('info', `Event photo skipped: ${err.message}`);
        }
      }

      const data = { title, description, startTime, endTime, isEvent, location: locationName, owner };
      if (dojoId != null) data.dojo = dojoId;
      if (imageId != null) data.eventImage = imageId;

      const { id, documentId } = await createEvent(data);
      const [ownerName] = await refreshUserNames([owner]);

      log('success', `Created ${isEvent ? 'event' : 'activity-type event'} #${id}: "${title}"`, {
        eventId: id,
        documentId,
        owner: ownerName,
        isEvent,
        location: { name: locationName },
        dojoId,
        hasPhoto: imageId != null,
        startTime,
        endTime,
      });
      created.push({ id, documentId, isEvent });
    } catch (err) {
      log('error', `Event ${i + 1} creation failed: ${err.message}`);
    }
  }

  return created;
}

/** (Re)build the cron job from the current config. Call after any config change. */
export function reschedule() {
  if (task) {
    task.stop();
    task = null;
  }

  const cfg = getConfig();
  if (!cfg.enabled) {
    log('info', 'Scheduler stopped (bot disabled)');
    return;
  }
  if (!cron.validate(cfg.cron)) {
    log('error', `Invalid cron expression, scheduler not started: "${cfg.cron}"`);
    return;
  }

  task = cron.schedule(
    cfg.cron,
    () => {
      runOnce().catch((err) => log('error', `runOnce threw: ${err.message}`));
    },
    { timezone: TIMEZONE },
  );
  log('info', `Scheduler armed: "${cfg.cron}" (${TIMEZONE})`);
}

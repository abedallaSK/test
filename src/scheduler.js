/**
 * Owns the cron job and the single-run logic that creates a dummy activity plus
 * its member rows, and (when autoEnd is on) auto-ends it after the timer.
 */

import cron from 'node-cron';
import { getConfig } from './config.js';
import { log } from './logger.js';
import { randomIsraeliLocation } from './locations.js';
import {
  getUsers,
  getDojos,
  createActivity,
  createActivityMember,
  endActivity,
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

/** Run one activity-creation cycle. Returns a result summary. */
export async function runOnce({ manual = false } = {}) {
  const cfg = getConfig();

  if (!cfg.enabled && !manual) {
    log('skip', 'Scheduler fired but bot is disabled');
    return { skipped: true, reason: 'disabled' };
  }
  if (cfg.selectedUserIds.length === 0) {
    log('skip', 'No users selected — nothing to create', { manual });
    return { skipped: true, reason: 'no-users' };
  }

  // Determine how many activities to create
  const numActivities = randInt(cfg.minActivities, cfg.maxActivities);
  
  // Ensure we have enough users for at least 1 member per activity
  const minUsersNeeded = numActivities * (cfg.minMembers + 1); // host + members per activity
  if (cfg.selectedUserIds.length < minUsersNeeded) {
    log('error', `Not enough users: need at least ${minUsersNeeded} for ${numActivities} activities`, { manual });
    return { ok: false, error: `Need at least ${minUsersNeeded} users for ${numActivities} activities` };
  }

  // Shuffle all selected users and distribute them across activities
  const shuffledUsers = shuffle([...cfg.selectedUserIds]);
  const activitiesCreated = [];
  let userIndex = 0;

  for (let actIdx = 0; actIdx < numActivities; actIdx++) {
    // Calculate members for this activity
    const remainingUsers = cfg.selectedUserIds.length - userIndex;
    const maxPossibleMembers = Math.min(
      cfg.maxMembers,
      remainingUsers - 1 // keep at least 1 for host
    );
    
    if (maxPossibleMembers < cfg.minMembers) {
      log('info', `Not enough users left for activity ${actIdx + 1}, stopping`);
      break;
    }

    const wantedMembers = randInt(cfg.minMembers, maxPossibleMembers);
    
    // First user is host, rest are members
    const hostId = shuffledUsers[userIndex++];
    const memberIds = shuffledUsers.slice(userIndex, userIndex + wantedMembers);
    userIndex += wantedMembers;

    const location = randomIsraeliLocation();
    const nowIso = new Date().toISOString();
    const durationMs = cfg.durationMinutes * 60 * 1000;

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
        durationMinutes: cfg.durationMinutes,
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
            log('info', `Auto-ended activity #${id} after ${cfg.durationMinutes} min`, {
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

  const totalMembers = activitiesCreated.reduce((sum, a) => sum + a.memberCount, 0);
  return { 
    ok: activitiesCreated.length > 0, 
    activitiesCreated: activitiesCreated.length,
    totalMembers,
    activityIds: activitiesCreated.map(a => a.id)
  };
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

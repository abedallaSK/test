/**
 * Minimal Expo push sender — mirrors the Dojo backend's pushService.
 * Posts straight to Expo's HTTP push API. The user's `fcmToken` field holds an
 * ExponentPushToken in this app.
 */

import { log } from './logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const isExpoPushToken = (t) =>
  typeof t === 'string' &&
  (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send Expo push messages. Invalid tokens are skipped. Returns a summary
 * { sent, failed, invalidResponses }. Every Expo API call is logged.
 * @param {Array<{to:string,title?:string,body?:string,data?:object}>} messages
 */
export async function sendExpoPush(messages) {
  const valid = messages.filter((m) => isExpoPushToken(m.to));
  const result = { sent: 0, failed: 0, batches: 0 };

  for (const batch of chunk(valid, 100)) {
    result.batches += 1;
    const start = Date.now();
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(
          batch.map((m) => ({ sound: 'default', ttl: 2419200, ...m })),
        ),
      });
      const ms = Date.now() - start;
      const json = await res.json().catch(() => null);

      log(res.ok ? 'api' : 'error',
        `POST exp.host/--/api/v2/push/send → ${res.status} (${batch.length} msg, ${ms}ms)`,
        { api: true, method: 'POST', path: 'exp.host/.../push/send', status: res.status, ms });

      const tickets = json?.data;
      if (res.ok && Array.isArray(tickets)) {
        for (const t of tickets) {
          if (t?.status === 'ok') result.sent += 1;
          else result.failed += 1;
        }
      } else {
        result.failed += batch.length;
      }
    } catch (err) {
      log('error', `Expo push batch failed: ${err.message}`);
      result.failed += batch.length;
    }
  }

  return result;
}

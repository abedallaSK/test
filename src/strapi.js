/**
 * Thin Strapi v5 REST client. Every call takes an `env` object (from
 * environments.js) carrying { id, name, origin, apiBase, token } — so the same
 * client can talk to multiple backends. Tokens stay server-side.
 */

import { log } from './logger.js';
import { isExpoPushToken } from './expo.js';

function assertEnv(env) {
  if (!env || !env.apiBase) throw new Error('Strapi environment is not configured (missing URL)');
  if (!env.token) throw new Error(`Strapi environment "${env.name || env.id}" has no token`);
}

async function request(env, method, path, body) {
  assertEnv(env);
  const url = `${env.apiBase}${path}`;
  const shortPath = `/api${path.split('?')[0]}`;
  const start = Date.now();

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const ms = Date.now() - start;
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // Surface every Strapi API call in the run log (tagged with the environment).
  log(res.ok ? 'api' : 'error', `[${env.name}] ${method} ${shortPath} → ${res.status} (${ms}ms)`, {
    api: true,
    env: env.id,
    envName: env.name,
    method,
    path: shortPath,
    status: res.status,
    ms,
  });

  if (!res.ok) {
    const detail = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`Strapi ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

/** Resolve an avatar URL to absolute if Strapi returned a relative path. */
function absoluteUrl(env, url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${env.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Internal: full user mapping INCLUDING the raw push token. The token never
// leaves the server — public endpoints expose only `hasToken`.
async function fetchUsersRaw(env) {
  const data = await request(env, 'GET', '/users?populate=avatar&pagination[limit]=1000');
  const list = Array.isArray(data) ? data : data?.data || [];
  return list.map((u) => ({
    id: u.id,
    name: u.fullName || u.displayName || u.username || `User #${u.id}`,
    avatarUrl: absoluteUrl(env, u.avatar?.url),
    token: u.fcmToken || null,
  }));
}

export async function getUsers(env) {
  const users = await fetchUsersRaw(env);
  return users.map(({ token, ...rest }) => ({
    ...rest,
    hasToken: isExpoPushToken(token),
  }));
}

/**
 * Resolve push targets. `userIds` is an array of ids, or the string 'all'.
 * Returns [{ id, name, token }] (unfiltered — caller decides token validity).
 */
export async function getPushTargets(env, userIds) {
  let users = await fetchUsersRaw(env);
  if (userIds !== 'all') {
    const set = new Set((userIds || []).map((n) => Number(n)));
    users = users.filter((u) => set.has(u.id));
  }
  return users;
}

export async function getDojos(env) {
  const data = await request(env, 'GET', '/dojos?pagination[limit]=1000');
  const list = data?.data || [];
  return list.map((d) => {
    const a = d.attributes || d;
    return { id: d.id, name: a.name || a.title || `Dojo #${d.id}` };
  });
}

/** Create an Activity. Returns { id, documentId }. */
export async function createActivity(env, data) {
  const res = await request(env, 'POST', '/activities', { data });
  const entity = res?.data || {};
  return { id: entity.id, documentId: entity.documentId };
}

/** Create an Activity_Member. Returns its id. */
export async function createActivityMember(env, data) {
  const res = await request(env, 'POST', '/activity-members', { data });
  return res?.data?.id;
}

/** End an activity by documentId (v5 updates address the documentId). */
export async function endActivity(env, documentId, endTimeIso) {
  return request(env, 'PUT', `/activities/${documentId}`, {
    data: { sessionStatus: 'ended', endTime: endTimeIso },
  });
}

/** Create an Event. Returns { id, documentId }. */
export async function createEvent(env, data) {
  const res = await request(env, 'POST', '/events', { data });
  const entity = res?.data || {};
  return { id: entity.id, documentId: entity.documentId };
}

/**
 * Download an image and upload it to Strapi's media library. Returns the new
 * file id (for linking to a media field like eventImage). Uses multipart, so
 * it bypasses the JSON `request()` helper. Logs the upload call.
 */
export async function uploadImageFromUrl(env, imageUrl, filename = 'event.jpg') {
  assertEnv(env);

  const imgRes = await fetch(imageUrl, { redirect: 'follow' });
  if (!imgRes.ok) throw new Error(`image download failed (${imgRes.status})`);
  const arrayBuf = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  const blob = new Blob([arrayBuf], { type: contentType });

  const form = new FormData();
  form.append('files', blob, filename);

  const start = Date.now();
  // Do NOT set Content-Type — fetch adds the multipart boundary itself.
  const res = await fetch(`${env.apiBase}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}` },
    body: form,
  });
  const ms = Date.now() - start;
  const json = await res.json().catch(() => null);

  log(res.ok ? 'api' : 'error', `[${env.name}] POST /api/upload → ${res.status} (${ms}ms)`, {
    api: true,
    env: env.id,
    envName: env.name,
    method: 'POST',
    path: '/api/upload',
    status: res.status,
    ms,
  });

  if (!res.ok) {
    throw new Error(`upload failed (${res.status}): ${json?.error?.message || ''}`);
  }
  const id = Array.isArray(json) ? json[0]?.id : json?.id;
  if (!id) throw new Error('upload returned no file id');
  return id;
}

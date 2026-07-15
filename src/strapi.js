/**
 * Thin Strapi v5 REST client. Base URL + token come from env only.
 *
 *   STRAPI_API_URL  e.g. https://api.dojospaces.com   (origin; /api is appended)
 *                   trailing "/api" or "/" is tolerated.
 *   STRAPI_TOKEN    API token with: read Users + Dojo, create Activity,
 *                   create + update Activity_Member (a Full-access token works).
 */

import { log } from './logger.js';
import { isExpoPushToken } from './expo.js';

function origins() {
  const raw = (process.env.STRAPI_API_URL || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('STRAPI_API_URL is not set');
  const origin = raw.replace(/\/api$/i, '');
  return { origin, apiBase: `${origin}/api` };
}

function token() {
  const t = (process.env.STRAPI_TOKEN || '').trim();
  if (!t) throw new Error('STRAPI_TOKEN is not set');
  return t;
}

async function request(method, path, body) {
  const { apiBase } = origins();
  const url = `${apiBase}${path}`;
  const shortPath = `/api${path.split('?')[0]}`;
  const start = Date.now();

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
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

  // Surface every Strapi API call in the run log so it's clear which endpoints
  // are hit (e.g. POST /api/activities, POST /api/activity-members).
  log(res.ok ? 'api' : 'error', `${method} ${shortPath} → ${res.status} (${ms}ms)`, {
    api: true,
    method,
    path: shortPath,
    status: res.status,
    ms,
  });

  if (!res.ok) {
    const detail =
      json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`Strapi ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

/** Resolve an avatar URL to absolute if Strapi returned a relative path. */
function absoluteUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const { origin } = origins();
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Internal: full user mapping INCLUDING the raw push token. The token never
// leaves the server — public endpoints expose only `hasToken`.
async function fetchUsersRaw() {
  // users-permissions /api/users returns a plain array (not the data wrapper).
  const data = await request(
    'GET',
    '/users?populate=avatar&pagination[limit]=1000',
  );
  const list = Array.isArray(data) ? data : data?.data || [];
  return list.map((u) => ({
    id: u.id,
    name: u.fullName || u.displayName || u.username || `User #${u.id}`,
    avatarUrl: absoluteUrl(u.avatar?.url),
    token: u.fcmToken || null,
  }));
}

export async function getUsers() {
  const users = await fetchUsersRaw();
  return users.map(({ token, ...rest }) => ({
    ...rest,
    hasToken: isExpoPushToken(token),
  }));
}

/**
 * Resolve push targets. `userIds` is an array of ids, or the string 'all'.
 * Returns [{ id, name, token }] (unfiltered — caller decides token validity).
 */
export async function getPushTargets(userIds) {
  let users = await fetchUsersRaw();
  if (userIds !== 'all') {
    const set = new Set((userIds || []).map((n) => Number(n)));
    users = users.filter((u) => set.has(u.id));
  }
  return users;
}

export async function getDojos() {
  const data = await request('GET', '/dojos?pagination[limit]=1000');
  const list = data?.data || [];
  return list.map((d) => {
    // v5 flattens attributes onto the entity; fall back to .attributes for safety.
    const a = d.attributes || d;
    return { id: d.id, name: a.name || a.title || `Dojo #${d.id}` };
  });
}

/** Create an Activity. Returns { id, documentId }. */
export async function createActivity(data) {
  const res = await request('POST', '/activities', { data });
  const entity = res?.data || {};
  return { id: entity.id, documentId: entity.documentId };
}

/** Create an Activity_Member. Returns its id. */
export async function createActivityMember(data) {
  const res = await request('POST', '/activity-members', { data });
  return res?.data?.id;
}

/** End an activity by documentId (v5 updates address the documentId). */
export async function endActivity(documentId, endTimeIso) {
  return request('PUT', `/activities/${documentId}`, {
    data: { sessionStatus: 'ended', endTime: endTimeIso },
  });
}

/** Create an Event. Returns { id, documentId }. */
export async function createEvent(data) {
  const res = await request('POST', '/events', { data });
  const entity = res?.data || {};
  return { id: entity.id, documentId: entity.documentId };
}

/**
 * Download an image and upload it to Strapi's media library. Returns the new
 * file id (for linking to a media field like eventImage). Uses multipart, so
 * it bypasses the JSON `request()` helper. Logs the upload call.
 */
export async function uploadImageFromUrl(imageUrl, filename = 'event.jpg') {
  const { apiBase } = origins();

  const imgRes = await fetch(imageUrl, { redirect: 'follow' });
  if (!imgRes.ok) throw new Error(`image download failed (${imgRes.status})`);
  const arrayBuf = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  const blob = new Blob([arrayBuf], { type: contentType });

  const form = new FormData();
  form.append('files', blob, filename);

  const start = Date.now();
  // Do NOT set Content-Type — fetch adds the multipart boundary itself.
  const res = await fetch(`${apiBase}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  });
  const ms = Date.now() - start;
  const json = await res.json().catch(() => null);

  log(res.ok ? 'api' : 'error', `POST /api/upload → ${res.status} (${ms}ms)`, {
    api: true,
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

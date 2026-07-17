/* Settings UI logic — talks only to the bot's own /api endpoints. */

const $ = (id) => document.getElementById(id);

/* ---------- icons (monochrome, inherit currentColor) ---------- */
/* Lucide-style geometry. One source of truth for HTML (via [data-icon])
   and for JS-generated markup (via svgIcon()). */
const ICONS = {
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  moon: '<path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  package: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  'upload-cloud': '<path d="M12 13v8M8 17l4-4 4 4"/><path d="M20 16.2A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>',
  play: '<polygon points="6 3 20 12 6 21" fill="currentColor" stroke="none"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
};

function svgIcon(name, extraClass = '') {
  return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Replace every <… data-icon="name"> placeholder in the DOM with its SVG. */
function injectIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const extra = el.getAttribute('data-icon-class') || '';
    const tmp = document.createElement('div');
    tmp.innerHTML = svgIcon(name, extra);
    el.replaceWith(tmp.firstChild);
  });
}

let allUsers = [];
const selected = new Set(); // activity pool (per current env)
const notifSelected = new Set(); // notification recipients
let savedSnapshot = null;
let logTimer = null;
let authToken = localStorage.getItem('authToken') || null;

let environments = []; // [{id, name}]
let currentEnv = localStorage.getItem('env') || null;
const saveTargetEnvs = new Set(); // env ids to write Activities/Events settings to

// Source of truth for the list editors.
const listState = { eventTitles: [], eventDescriptions: [] };

/* ---------- theme ---------- */

const THEMES = ['dark', 'light', 'dojo'];
function applyTheme(name) {
  const t = THEMES.includes(name) ? name : 'dark';
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  document.querySelectorAll('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.themeValue === t));
  const metaColors = { dark: '#0d0f16', light: '#f4f6fb', dojo: '#14100e' };
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = metaColors[t];
}

/* ---------- helpers ---------- */

function banner(message, type = 'info') {
  const el = $('banner');
  el.className = `banner ${type}`;
  // Strip any leading decorative glyph — the type icon replaces it.
  const text = String(message || '').replace(/^[☀-➿←-⇿⬀-⯿️\u{1F000}-\u{1FAFF}\s]+/u, '');
  if (!message) { el.classList.add('hidden'); el.innerHTML = ''; }
  else {
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert' : 'info';
    el.innerHTML = `${svgIcon(iconName)}<span class="banner-text"></span>`;
    el.querySelector('.banner-text').textContent = text;
    el.classList.remove('hidden');
    if (type !== 'error') setTimeout(() => el.classList.add('hidden'), 4000);
  }
}

function withEnv(path) {
  if (!currentEnv) return path;
  return path + (path.includes('?') ? '&' : '?') + 'env=' + encodeURIComponent(currentEnv);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  authToken = data.token;
  localStorage.setItem('authToken', authToken);
  return true;
}

async function logout() {
  const token = authToken;
  authToken = null;
  localStorage.removeItem('authToken');
  try { await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  showLoginScreen();
}

async function checkAuth() {
  if (!authToken) return false;
  try {
    const res = await fetch('/api/auth', { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json();
    return data.authenticated;
  } catch { return false; }
}

function showLoginScreen() {
  $('login-screen').classList.remove('hidden');
  $('tabs').classList.add('hidden');
  document.querySelectorAll('main').forEach((el) => el.classList.add('hidden'));
  $('activities-actionbar').classList.add('hidden');
  const logsWrap = document.querySelector('.logs-wrap');
  if (logsWrap) logsWrap.classList.add('hidden');
  $('logout-btn').classList.add('hidden');
}

function hideLoginScreen() {
  $('login-screen').classList.add('hidden');
  $('tabs').classList.remove('hidden');
  const logsWrap = document.querySelector('.logs-wrap');
  if (logsWrap) logsWrap.classList.remove('hidden');
  $('logout-btn').classList.remove('hidden');
}

function cronToHuman(expr) {
  const c = (expr || '').trim();
  let m;
  if ((m = c.match(/^\*\/(\d+) \* \* \* \*$/))) return `Every ${m[1]} minute(s)`;
  if (c === '* * * * *') return 'Every minute';
  if ((m = c.match(/^0 \*\/(\d+) \* \* \*$/))) return `Every ${m[1]} hour(s)`;
  if ((m = c.match(/^(\d+) (\d+) \* \* \*$/)))
    return `Daily at ${String(m[2]).padStart(2, '0')}:${String(m[1]).padStart(2, '0')}`;
  if ((m = c.match(/^0 (\d+) \* \* \*$/))) return `Daily at ${String(m[1]).padStart(2, '0')}:00`;
  return `cron: ${c}`;
}

function parseCronDetails(expr) {
  const parts = (expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const explain = (field, name) => {
    if (field === '*') return `${name}: every`;
    if (field.startsWith('*/')) return `${name}: every ${field.slice(2)}`;
    if (field.includes('-')) { const [s, e] = field.split('-'); return `${name}: ${s}–${e}`; }
    if (field.includes(',')) return `${name}: ${field}`;
    return `${name}: at ${field}`;
  };
  return [
    explain(minute, 'Min'), explain(hour, 'Hour'), explain(dayOfMonth, 'Day'),
    explain(month, 'Month'), explain(dayOfWeek, 'Weekday'),
  ];
}

function renderCronDetails(containerId, expr) {
  const details = parseCronDetails(expr);
  const el = $(containerId);
  el.innerHTML = details ? details.map((d) => `<div>${d}</div>`).join('')
    : '<span class="muted">Invalid cron expression</span>';
}

const tokenCount = () => allUsers.filter((u) => u.hasToken).length;

/* ---------- tabs ---------- */

let activeTab = 'activities';
function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('panel-activities').classList.toggle('hidden', name !== 'activities');
  $('panel-events').classList.toggle('hidden', name !== 'events');
  $('panel-notify').classList.toggle('hidden', name !== 'notify');
  $('panel-whatsnew').classList.toggle('hidden', name !== 'whatsnew');
  $('activities-actionbar').classList.toggle('hidden', name === 'notify' || name === 'whatsnew');
  $('run-now').innerHTML = svgIcon('play') + (name === 'events' ? ' Run events now' : ' Run activities now');
}

/* ---------- form state ---------- */

function formState() {
  return {
    // activities schedule
    activitiesEnabled: $('activitiesEnabled').checked,
    activityCron: $('activityCron').value.trim(),
    // events schedules
    eventsTrueEnabled: $('eventsTrueEnabled').checked,
    eventsTrueCron: $('eventsTrueCron').value.trim(),
    eventsTrueMin: parseInt($('eventsTrueMin').value, 10) || 0,
    eventsTrueMax: parseInt($('eventsTrueMax').value, 10) || 0,
    eventsFalseEnabled: $('eventsFalseEnabled').checked,
    eventsFalseCron: $('eventsFalseCron').value.trim(),
    eventsFalseMin: parseInt($('eventsFalseMin').value, 10) || 0,
    eventsFalseMax: parseInt($('eventsFalseMax').value, 10) || 0,
    // activity settings
    minDurationMinutes: parseInt($('minDuration').value, 10) || 1,
    maxDurationMinutes: parseInt($('maxDuration').value, 10) || 1,
    minMembers: parseInt($('minMembers').value, 10) || 0,
    maxMembers: parseInt($('maxMembers').value, 10) || 0,
    minActivities: parseInt($('minActivities').value, 10) || 1,
    maxActivities: parseInt($('maxActivities').value, 10) || 1,
    activityType: $('activityType').value,
    autoEnd: $('autoEnd').checked,
    attachDojo: $('attachDojo').checked,
    // shared event settings
    eventDurationMinutes: parseInt($('eventDurationMinutes').value, 10) || 1,
    eventFutureMinDays: parseInt($('eventFutureMinDays').value, 10) || 0,
    eventFutureMaxDays: parseInt($('eventFutureMaxDays').value, 10) || 0,
    eventAttachPhoto: $('eventAttachPhoto').checked,
    eventAttachDojo: $('eventAttachDojo').checked,
    eventTitles: [...listState.eventTitles],
    eventDescriptions: [...listState.eventDescriptions],
    selectedUserIds: [...selected].sort((a, b) => a - b),
  };
}
const isDirty = () => savedSnapshot !== null && JSON.stringify(formState()) !== savedSnapshot;

function refreshUi() {
  const s = formState();
  const anyOn = s.activitiesEnabled || s.eventsTrueEnabled || s.eventsFalseEnabled;
  const pill = $('status-pill');
  pill.classList.toggle('on', anyOn);
  pill.classList.toggle('off', !anyOn);
  $('status-text').textContent = anyOn ? 'On schedule' : 'Paused';

  // activities summary
  $('sum-state').textContent = s.activitiesEnabled ? 'Enabled' : 'Disabled';
  $('sum-state').className = 'stat-value ' + (s.activitiesEnabled ? 'good' : 'warn');
  $('sum-schedule').textContent = cronToHuman(s.activityCron);
  $('sum-duration').textContent = s.minDurationMinutes === s.maxDurationMinutes
    ? `${s.minDurationMinutes} min` : `${s.minDurationMinutes}–${s.maxDurationMinutes} min`;
  $('sum-members').textContent = s.minMembers === s.maxMembers ? `${s.minMembers}` : `${s.minMembers}–${s.maxMembers}`;
  $('sum-pool').textContent = `${selected.size} selected`;
  $('sum-autoend').textContent = s.autoEnd ? 'Auto-end' : 'Stay active';
  $('act-cron-human').textContent = `${cronToHuman(s.activityCron)} · Asia/Jerusalem`;
  renderCronDetails('act-cron-details', s.activityCron);

  // events summary (two schedules)
  $('esum-true-state').textContent = s.eventsTrueEnabled ? 'Enabled' : 'Disabled';
  $('esum-true-state').className = 'stat-value ' + (s.eventsTrueEnabled ? 'good' : 'warn');
  $('esum-true-sched').textContent = cronToHuman(s.eventsTrueCron);
  $('esum-false-state').textContent = s.eventsFalseEnabled ? 'Enabled' : 'Disabled';
  $('esum-false-state').className = 'stat-value ' + (s.eventsFalseEnabled ? 'good' : 'warn');
  $('esum-false-sched').textContent = cronToHuman(s.eventsFalseCron);
  $('esum-window').textContent = s.eventFutureMinDays === s.eventFutureMaxDays
    ? `${s.eventFutureMinDays}d ahead` : `${s.eventFutureMinDays}–${s.eventFutureMaxDays}d ahead`;
  $('esum-photo').textContent = s.eventAttachPhoto ? 'On' : 'Off';
  $('evt-cron-human').textContent = `${cronToHuman(s.eventsTrueCron)} · Asia/Jerusalem`;
  $('evf-cron-human').textContent = `${cronToHuman(s.eventsFalseCron)} · Asia/Jerusalem`;
  renderCronDetails('evt-cron-details', s.eventsTrueCron);
  renderCronDetails('evf-cron-details', s.eventsFalseCron);

  $('pool-counts').textContent =
    `${listState.eventTitles.length} title(s) · ${listState.eventDescriptions.length} description(s)`;

  const dirty = isDirty();
  $('dirty-note').classList.toggle('hidden', !dirty);
  $('edirty-note').classList.toggle('hidden', !dirty);
  $('save').classList.toggle('attention', dirty);
  $('actionbar-hint').textContent = dirty ? 'Unsaved changes' : 'All changes saved.';
}

/* ---------- users (activity pool) ---------- */

function renderUsers() {
  const q = $('user-search').value.trim().toLowerCase();
  const box = $('users');
  if (!allUsers.length) return void (box.innerHTML = '<span class="loading">No users found.</span>');
  const list = allUsers.filter((u) => !q || u.name.toLowerCase().includes(q));
  box.innerHTML = list.length ? '' : '<span class="loading">No matches.</span>';
  for (const u of list) box.appendChild(userRow(u, selected, updateCount, refreshUi));
  updateCount();
}
function updateCount() { $('selected-count').textContent = `${selected.size} selected`; }

function userRow(u, set, onCount, onChange, { tokenOnly = false } = {}) {
  const row = document.createElement('label');
  const disabled = tokenOnly && !u.hasToken;
  row.className = 'user' + (set.has(u.id) ? ' on' : '') + (disabled ? ' disabled' : '');
  const avatar = u.avatarUrl
    ? `<img src="${u.avatarUrl}" alt="" loading="lazy" />`
    : `<span class="avatar-fallback">${(u.name[0] || '?').toUpperCase()}</span>`;
  const badge = u.hasToken ? `<span class="tok" title="Has a device token">${svgIcon('smartphone')}</span>` : '';
  row.innerHTML = `
    <input type="checkbox" ${set.has(u.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
    ${avatar}
    <span class="uname" title="${u.name}">${u.name}</span>
    ${badge}
    <span class="uid">#${u.id}</span>`;
  row.querySelector('input').addEventListener('change', (e) => {
    if (e.target.checked) set.add(u.id); else set.delete(u.id);
    row.classList.toggle('on', e.target.checked);
    onCount();
    if (onChange) onChange();
  });
  return row;
}

/* ---------- users (notification recipients) ---------- */

function renderNotifUsers() {
  const q = $('notif-search').value.trim().toLowerCase();
  const tokenOnly = $('only-token').checked;
  const box = $('notif-users');
  if (!allUsers.length) return void (box.innerHTML = '<span class="loading">No users found.</span>');
  let list = allUsers.filter((u) => !q || u.name.toLowerCase().includes(q));
  if (tokenOnly) list = list.filter((u) => u.hasToken);
  box.innerHTML = list.length ? '' : '<span class="loading">No matches.</span>';
  for (const u of list) box.appendChild(userRow(u, notifSelected, updateNotifCount, refreshNotify, { tokenOnly }));
  updateNotifCount();
}
function updateNotifCount() { $('notif-selected-count').textContent = `${notifSelected.size} selected`; }
function currentNotifMode() { return document.querySelector('input[name="notif-mode"]:checked').value; }

function refreshNotify() {
  const mode = currentNotifMode();
  const total = tokenCount();
  $('notif-target-count').textContent = `${total} with a token`;
  $('notif-picker').classList.toggle('hidden', mode === 'all');
  const allNote = $('notif-all-note');
  allNote.classList.toggle('hidden', mode !== 'all');
  if (mode === 'all') allNote.textContent = `Will send to all ${total} user(s) that have a device token.`;

  let recipients = mode === 'all' ? total
    : [...notifSelected].filter((id) => allUsers.find((u) => u.id === id)?.hasToken).length;

  const title = $('notif-title').value.trim();
  const body = $('notif-body').value.trim();
  $('pp-title').textContent = title || 'Notification title';
  $('pp-body').textContent = body || 'Your message preview…';

  const hasMsg = title || body;
  $('notif-hint').textContent = !hasMsg ? 'Compose a title or message.' : `${recipients} recipient(s) with a token ready.`;
  $('send-notif').disabled = !hasMsg || recipients === 0;
}

async function sendNotification() {
  const mode = currentNotifMode();
  const body = {
    env: currentEnv, title: $('notif-title').value.trim(), body: $('notif-body').value.trim(),
    mode, userIds: mode === 'selected' ? [...notifSelected] : [],
  };
  $('send-notif').disabled = true;
  banner('Sending notification…', 'info');
  try {
    const r = await api('/api/notify', { method: 'POST', body: JSON.stringify(body) });
    if (r.sent > 0)
      banner(`✓ Sent to ${r.sent} device(s). ${r.failed ? r.failed + ' failed. ' : ''}${r.skipped ? r.skipped + ' had no token.' : ''}`, 'success');
    else banner(`Nothing sent. ${r.skipped ? r.skipped + ' recipient(s) had no token.' : 'No valid recipients.'}`, 'error');
    loadLogs();
  } catch (err) {
    banner(`Send failed: ${err.message}`, 'error');
  }
  refreshNotify();
}

/* ========== What's New Tab ========== */

let whatsNewEntries = [];          // entries for the currently filtered env
let whatsNewByEnv = new Map();     // envId -> entries (cached for quick re-render when switching envs)
let whatsNewEnvFilter = null;      // envId for the list filter (defaults to currentEnv)
let editingEntry = null;           // { documentId, envId, original } while editing
let pendingMediaFiles = [];        // File[] queued in the form
let pendingUploadedMedia = [];     // [{ id, url, mime }] already uploaded to Strapi (for edit mode)
const wnTargetEnvs = new Set();    // env ids the new entry will be created on (multi-select)

async function loadWhatsNewEntries() {
  const filterEnv = whatsNewEnvFilter || currentEnv;
  if (!filterEnv) {
    whatsNewEntries = [];
    $('wn-list').innerHTML = '<div class="wn-empty-state">Pick an environment first.</div>';
    return;
  }
  try {
    const data = await api('/api/whatsnew?env=' + encodeURIComponent(filterEnv));
    const list = Array.isArray(data) ? data : (data?.data || []);
    whatsNewEntries = list;
    whatsNewByEnv.set(filterEnv, list);
    renderWhatsNewList();
    updateWhatsNewSummary();
  } catch (err) {
    whatsNewEntries = [];
    $('wn-list').innerHTML = `<span class="loading err">⚠ Failed to load: ${err.message}</span>`;
  }
}

/** semver-ish comparison: "1.2.10" > "1.2.9". Falls back to string compare. */
function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return String(a || '').localeCompare(String(b || ''));
}

function wnKey(entry) { return String(entry.documentId || entry.id); }
function findWnEntry(id) { return whatsNewEntries.find((e) => wnKey(e) === String(id)); }

/** Fill the "jump to version" dropdown with the unique versions in this env. */
function populateVersionFilter() {
  const sel = $('wn-version-filter');
  if (!sel) return;
  const prev = sel.value;
  const versions = [...new Set(whatsNewEntries.map((e) => e.version).filter(Boolean))]
    .sort((a, b) => compareVersions(b, a));
  sel.innerHTML = '<option value="">All versions</option>' +
    versions.map((v) => `<option value="${escapeHtml(v)}">v${escapeHtml(v)}</option>`).join('');
  if (versions.includes(prev)) sel.value = prev;
}

function renderWhatsNewList() {
  const q = $('wn-search').value.trim().toLowerCase();
  const versionFilter = $('wn-version-filter').value;
  const sortMode = $('wn-sort').value;
  const activeOnly = $('wn-filter-active').checked;
  const box = $('wn-list');

  populateVersionFilter();

  let filtered = whatsNewEntries.slice();
  if (activeOnly) filtered = filtered.filter((e) => e.active !== false);
  if (versionFilter) filtered = filtered.filter((e) => e.version === versionFilter);
  if (q) filtered = filtered.filter((e) =>
    (e.version || '').toLowerCase().includes(q) ||
    (e.title || '').toLowerCase().includes(q) ||
    (e.description || '').toLowerCase().includes(q),
  );

  const envName = envNameOf(whatsNewEnvFilter || currentEnv);
  const manual = sortMode === 'order';
  $('wn-list-hint').textContent = manual
    ? `Showing ${filtered.length} of ${whatsNewEntries.length} on ${envName}. Use the up/down arrows to reorder — the new order saves instantly.`
    : `Showing ${filtered.length} of ${whatsNewEntries.length} on ${envName}, sorted by version.`;

  if (!whatsNewEntries.length) {
    box.innerHTML = `<div class="wn-empty-state">
      <div class="wn-empty-icon">${svgIcon('package', 'icon-xl')}</div>
      <p>No entries on <b>${escapeHtml(envName)}</b> yet.</p>
      <p class="muted">Add your first version entry above.</p>
    </div>`;
    return;
  }
  if (!filtered.length) {
    box.innerHTML = `<div class="wn-empty-state">
      <div class="wn-empty-icon">${svgIcon('search', 'icon-xl')}</div>
      <p>No entries match your filters.</p>
      <p class="muted">Try clearing the search / version filter or uncheck "Active only".</p>
    </div>`;
    return;
  }

  if (sortMode === 'version-desc') filtered.sort((a, b) => compareVersions(b.version, a.version));
  else if (sortMode === 'version-asc') filtered.sort((a, b) => compareVersions(a.version, b.version));
  else filtered.sort((a, b) => (b.order || 0) - (a.order || 0) || compareVersions(b.version, a.version));

  box.innerHTML = '';
  filtered.forEach((entry, idx) => {
    const card = document.createElement('div');
    card.className = 'wn-entry' + (entry.active === false ? ' inactive' : '');

    const platformClass = (entry.platform || 'all').toLowerCase();

    const mediaList = Array.isArray(entry.media) ? entry.media : (entry.image ? [entry.image] : []);
    const mediaHtml = mediaList
      .map((m) => {
        if (!m) return '';
        const u = m.url || '';
        const isVid = (m.mime || '').startsWith('video/');
        if (isVid) return `<video src="${u}" muted loop playsinline preload="metadata"></video>`;
        return `<img src="${u}" alt="" loading="lazy" />`;
      })
      .join('');
    const mediaCount = mediaList.length;
    const id = wnKey(entry);

    // Manual-order reorder arrows (disabled at the ends).
    const reorder = manual ? `
      <span class="wn-reorder" title="Reorder">
        <button type="button" class="wn-move" ${idx === 0 ? 'disabled' : ''} onclick="moveWhatsNewEntry('${id}', -1)" title="Move up">${svgIcon('chevron-up')}</button>
        <button type="button" class="wn-move" ${idx === filtered.length - 1 ? 'disabled' : ''} onclick="moveWhatsNewEntry('${id}', 1)" title="Move down">${svgIcon('chevron-down')}</button>
      </span>` : '';

    card.innerHTML = `
      <div class="wn-entry-main">
        <div class="wn-entry-header">
          ${reorder}
          <span class="wn-version-badge">v${escapeHtml(entry.version || '?')}</span>
          <span class="wn-platform-badge ${platformClass}">${escapeHtml(entry.platform || 'all')}</span>
          ${entry.active === false ? '<span class="wn-platform-badge inactive-badge">Inactive</span>' : ''}
          <span class="wn-env-badge" title="Environment">${svgIcon('globe')} ${escapeHtml(envName)}</span>
        </div>
        <h4 class="wn-entry-title">${escapeHtml(entry.title || 'Untitled')}</h4>
        <p class="wn-entry-desc">${escapeHtml(entry.description || 'No description')}</p>
        <div class="wn-entry-meta">
          <span>Order: <b>${entry.order ?? 0}</b></span>
          ${mediaCount ? `<span>${svgIcon('paperclip')} ${mediaCount} media</span>` : ''}
        </div>
        ${mediaHtml ? `<div class="wn-entry-media">${mediaHtml}</div>` : ''}
      </div>
      <div class="wn-entry-actions">
        <button type="button" class="ghost" onclick="editWhatsNewEntry('${id}')" title="Edit">${svgIcon('edit')} Edit</button>
        <button type="button" class="ghost" onclick="toggleWhatsNewActive('${id}')" title="Toggle Active">${entry.active === false ? svgIcon('check-circle') + ' Activate' : svgIcon('pause') + ' Deactivate'}</button>
        <button type="button" class="ghost danger" onclick="deleteWhatsNewEntry('${id}')" title="Delete">${svgIcon('trash')} Delete</button>
      </div>
    `;
    box.appendChild(card);
  });
}

/**
 * Move an entry up/down in manual-order mode. Reindexes every entry to a
 * distinct order (top = highest) and persists only the ones that changed.
 */
window.moveWhatsNewEntry = async function (documentId, dir) {
  const ordered = [...whatsNewEntries].sort(
    (a, b) => (b.order || 0) - (a.order || 0) || compareVersions(b.version, a.version),
  );
  const i = ordered.findIndex((e) => wnKey(e) === String(documentId));
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= ordered.length) return;
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];

  const n = ordered.length;
  const env = whatsNewEnvFilter || currentEnv;
  const updates = [];
  ordered.forEach((e, idx) => {
    const newOrder = n - idx; // top row gets the highest order
    if ((e.order ?? 0) !== newOrder) updates.push([e, newOrder]);
  });
  if (!updates.length) return;

  banner('Reordering…', 'info');
  try {
    for (const [e, newOrder] of updates) {
      await api('/api/whatsnew/' + encodeURIComponent(wnKey(e)) + '?env=' + encodeURIComponent(env), {
        method: 'PUT',
        body: JSON.stringify({ data: { order: newOrder } }),
      });
      e.order = newOrder;
    }
    whatsNewByEnv.delete(env);
    banner('✓ Order updated.', 'success');
    renderWhatsNewList();
    updateWhatsNewSummary();
    loadLogs();
  } catch (err) {
    banner(`Reorder failed: ${err.hint || err.message}`, 'error');
    await loadWhatsNewEntries();
  }
};

function envNameOf(id) {
  return environments.find((e) => e.id === id)?.name || id || 'unknown';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateWhatsNewSummary() {
  // Summary reflects the currently filtered view.
  const total = whatsNewEntries.length;
  const active = whatsNewEntries.filter((e) => e.active !== false).length;
  const latest = whatsNewEntries.length
    ? [...whatsNewEntries].sort(
        (a, b) => (b.order ?? 0) - (a.order ?? 0) || (b.version || '').localeCompare(a.version || ''),
      )[0]?.version || '—'
    : '—';
  const platforms = [...new Set(whatsNewEntries.map((e) => e.platform || 'all'))].join(', ') || '—';

  $('wnsum-total').textContent = total;
  $('wnsum-active').textContent = active;
  $('wnsum-latest').textContent = latest;
  $('wnsum-platforms').textContent = platforms;
}

function populateEnvFilter() {
  const sel = $('wn-env-filter');
  if (!sel) return;
  const cur = whatsNewEnvFilter || currentEnv;
  sel.innerHTML = '';
  for (const e of environments) {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.name}${e.id === currentEnv ? '  (current)' : ''}`;
    if (e.id === cur) opt.selected = true;
    sel.appendChild(opt);
  }
}

/* Target-env multi-select on the "Add entry" form. Current env is the default. */
function renderWnTargetEnvs() {
  const list = $('wn-target-list');
  if (!list) return;
  // Seed defaults to the current env the first time (and drop any stale ids).
  if (![...wnTargetEnvs].some((id) => environments.find((e) => e.id === id))) {
    wnTargetEnvs.clear();
    if (currentEnv) wnTargetEnvs.add(currentEnv);
  }
  list.innerHTML = '';
  for (const e of environments) {
    const label = document.createElement('label');
    label.className = 'apply-env-chip';
    const isCurrent = e.id === currentEnv;
    label.innerHTML =
      `<input type="checkbox" value="${escapeHtml(e.id)}" ${wnTargetEnvs.has(e.id) ? 'checked' : ''} />` +
      `<span>${escapeHtml(e.name)}${isCurrent ? ' <em class="chip-you">current</em>' : ''}</span>`;
    label.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) wnTargetEnvs.add(e.id); else wnTargetEnvs.delete(e.id);
    });
    list.appendChild(label);
  }
}

function readWnTargets() {
  const ids = [...document.querySelectorAll('#wn-target-list input[type="checkbox"]')]
    .filter((i) => i.checked).map((i) => i.value);
  return ids.length ? ids : (currentEnv ? [currentEnv] : []);
}

function setEditMode(entry) {
  editingEntry = entry ? { documentId: entry.documentId || entry.id, envId: whatsNewEnvFilter || currentEnv, original: entry } : null;
  $('wn-add-btn').classList.toggle('hidden', !!entry);
  $('wn-update-btn').classList.toggle('hidden', !entry);
  $('wn-cancel-edit-btn').classList.toggle('hidden', !entry);
  $('wn-edit-indicator').classList.toggle('hidden', !entry);
  // Multi-env targeting only applies when creating a new entry.
  $('wn-target-envs').classList.toggle('hidden', !!entry);
  $('wn-form-title').textContent = entry ? `Edit v${escapeHtml(entry.version || '?')}` : 'Add New Version Entry';
  if (entry) {
    $('wn-version').value = entry.version || '';
    $('wn-platform').value = entry.platform || 'all';
    $('wn-order').value = entry.order ?? 0;
    $('wn-active').checked = entry.active !== false;
    $('wn-title').value = entry.title || '';
    $('wn-description').value = entry.description || '';
    // Hydrate "existing media" so we don't re-upload on save
    const existing = Array.isArray(entry.media) ? entry.media : (entry.image ? [entry.image] : []);
    pendingUploadedMedia = existing.filter(Boolean).map((m) => ({ id: m.id, url: m.url, mime: m.mime || '' }));
    pendingMediaFiles = [];
    renderMediaPreview();
    $('wn-version').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearWhatsNewForm() {
  $('wn-version').value = '';
  $('wn-title').value = '';
  $('wn-description').value = '';
  $('wn-order').value = '0';
  $('wn-platform').value = 'all';
  $('wn-active').checked = true;
  $('wn-form-error').classList.add('hidden');
  pendingMediaFiles = [];
  pendingUploadedMedia = [];
  setEditMode(null);
  renderMediaPreview();
}

window.editWhatsNewEntry = function (id) {
  const entry = findWnEntry(id);
  if (!entry) return;
  setEditMode(entry);
  banner(`Editing v${entry.version}. Make changes and click "Update Entry".`, 'info');
};

window.toggleWhatsNewActive = async function (id) {
  const entry = findWnEntry(id);
  if (!entry) return;
  try {
    const id = entry.documentId || entry.id;
    const filterEnv = whatsNewEnvFilter || currentEnv;
    const patch = { active: entry.active === false };
    await api('/api/whatsnew/' + encodeURIComponent(id) + '?env=' + encodeURIComponent(filterEnv), {
      method: 'PUT',
      body: JSON.stringify({ data: patch }),
    });
    banner(`Entry ${patch.active ? 'activated' : 'deactivated'}.`, 'success');
    await loadWhatsNewEntries();
  } catch (err) {
    banner(`Failed: ${err.message}`, 'error');
  }
};

window.deleteWhatsNewEntry = async function (id) {
  const entry = findWnEntry(id);
  if (!entry) return;
  if (!confirm(`Delete version "${entry.version}" on ${envNameOf(whatsNewEnvFilter || currentEnv)}? This cannot be undone.`)) return;
  try {
    const id = entry.documentId || entry.id;
    const filterEnv = whatsNewEnvFilter || currentEnv;
    await api('/api/whatsnew/' + encodeURIComponent(id) + '?env=' + encodeURIComponent(filterEnv), { method: 'DELETE' });
    whatsNewByEnv.delete(filterEnv);
    banner('Entry deleted.', 'success');
    await loadWhatsNewEntries();
    loadLogs();
  } catch (err) {
    banner(`Delete failed: ${err.message}`, 'error');
  }
};

/* ---------- media upload UI ---------- */

function classifyMedia(file) {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/') || /\.(gif|png|jpe?g|webp|bmp|svg)$/i.test(file.name)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) return 'video';
  return 'other';
}

function humanSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderMediaPreview() {
  const grid = $('wn-media-preview');
  const empty = $('wn-dropzone-empty');
  grid.innerHTML = '';

  // Show already-uploaded media first
  pendingUploadedMedia.forEach((m, idx) => {
    const isVid = (m.mime || '').startsWith('video/');
    const item = document.createElement('div');
    item.className = 'media-preview-item uploaded';
    item.innerHTML = `
      ${isVid
        ? `<video src="${m.url}" muted loop playsinline preload="metadata"></video>`
        : `<img src="${m.url}" alt="" />`}
      <span class="media-type-badge">${isVid ? 'VIDEO' : 'IMG'}</span>
      <button type="button" class="remove-media" title="Remove from entry" data-remove-uploaded="${idx}">${svgIcon('x')}</button>
      <span class="file-name">${escapeHtml((m.url || '').split('/').pop() || 'file')}</span>`;
    grid.appendChild(item);
  });

  // Then any new pending files
  pendingMediaFiles.forEach((f, idx) => {
    const kind = classifyMedia(f);
    const url = URL.createObjectURL(f);
    const item = document.createElement('div');
    item.className = 'media-preview-item pending';
    item.innerHTML = `
      ${kind === 'video'
        ? `<video src="${url}" muted loop playsinline preload="metadata"></video>`
        : `<img src="${url}" alt="" />`}
      <span class="media-type-badge">${kind === 'video' ? 'VIDEO' : (f.name.toLowerCase().endsWith('.gif') ? 'GIF' : 'IMG')}</span>
      <button type="button" class="remove-media" title="Remove" data-remove-pending="${idx}">${svgIcon('x')}</button>
      <span class="file-name">${escapeHtml(f.name)}</span>`;
    grid.appendChild(item);
  });

  // Hide the empty hint when something is loaded
  if (empty) empty.style.display = pendingUploadedMedia.length + pendingMediaFiles.length ? 'none' : '';

  // Wire up remove buttons
  grid.querySelectorAll('[data-remove-uploaded]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.removeUploaded, 10);
      pendingUploadedMedia.splice(i, 1);
      renderMediaPreview();
    });
  });
  grid.querySelectorAll('[data-remove-pending]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.removePending, 10);
      pendingMediaFiles.splice(i, 1);
      renderMediaPreview();
    });
  });
}

function addMediaFiles(fileList) {
  const MAX = 8;
  const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
  const files = [...fileList];
  for (const f of files) {
    if (pendingMediaFiles.length + pendingUploadedMedia.length >= MAX) {
      banner(`Max ${MAX} media files per entry.`, 'error');
      break;
    }
    if (f.size > MAX_BYTES) {
      banner(`"${f.name}" is too large (max ${humanSize(MAX_BYTES)}).`, 'error');
      continue;
    }
    const kind = classifyMedia(f);
    if (kind === 'other') {
      banner(`"${f.name}" is not a supported media type.`, 'error');
      continue;
    }
    pendingMediaFiles.push(f);
  }
  renderMediaPreview();
}

/**
 * Upload the queued File objects to a SPECIFIC environment and return
 * [{ id, url, mime, name }]. Media ids are per-environment in Strapi, so when
 * an entry is created on several envs we must upload the files to each one.
 */
async function uploadFilesToEnv(envId, files) {
  if (!files.length) return [];
  const progress = $('wn-upload-progress');
  const bar = $('wn-upload-progress-bar');
  const text = $('wn-upload-progress-text');
  progress.classList.remove('hidden');
  bar.style.width = '0%';

  const uploaded = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    text.textContent = `Uploading ${i + 1} / ${files.length} to ${envNameOf(envId)}…`;
    const form = new FormData();
    form.append('files', f, f.name);
    const res = await fetch('/api/upload?env=' + encodeURIComponent(envId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      progress.classList.add('hidden');
      throw new Error(`Upload failed for ${f.name}: ${json.error || res.statusText}`);
    }
    for (const r of (Array.isArray(json) ? json : [json])) {
      if (r?.id) uploaded.push({ id: r.id, url: r.url, mime: f.type, name: f.name });
    }
    bar.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
  }
  progress.classList.add('hidden');
  return uploaded;
}

/** Attach uploaded media to a payload. Always sets both fields so removals persist. */
function attachMedia(data, uploaded) {
  data.image = uploaded[0]?.id ?? null;
  data.media = uploaded.map((u) => u.id);
  return data;
}

function wireMediaDropzone() {
  const zone = $('wn-media-dropzone');
  const input = $('wn-media-file');
  if (!zone || !input) return;

  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

  // Click to open file picker (but not when clicking the preview grid)
  zone.addEventListener('click', (e) => {
    if (e.target.closest('.media-preview-item')) return; // don't open picker on preview clicks
    input.click();
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });

  input.addEventListener('change', () => {
    if (input.files?.length) addMediaFiles(input.files);
    input.value = ''; // allow re-picking the same file
  });

  // Drag & drop
  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { prevent(e); zone.classList.add('dragover'); }),
  );
  ['dragleave', 'dragend', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { prevent(e); zone.classList.remove('dragover'); }),
  );
  zone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files?.length) addMediaFiles(files);
  });

  // Paste from clipboard
  document.addEventListener('paste', (e) => {
    if (activeTab !== 'whatsnew') return;
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) addMediaFiles(files);
  });
}

/* ---------- payload assembly + save ---------- */

function buildPayload() {
  return {
    version: $('wn-version').value.trim(),
    platform: $('wn-platform').value,
    order: parseInt($('wn-order').value, 10) || 0,
    active: $('wn-active').checked,
    title: $('wn-title').value.trim(),
    description: $('wn-description').value.trim(),
  };
}

function validatedPayload() {
  const errEl = $('wn-form-error');
  errEl.classList.add('hidden');
  const data = buildPayload();
  if (!data.version) {
    errEl.textContent = 'Version is required';
    errEl.classList.remove('hidden');
    return null;
  }
  return data;
}

async function createEntry(targetEnvs) {
  const base = validatedPayload();
  if (!base) return false;
  const btn = $('wn-add-btn');
  btn.disabled = true;
  const results = { ok: [], failed: [] };
  try {
    for (const envId of targetEnvs) {
      try {
        // Upload the queued files fresh to THIS env (media ids are per-env).
        const uploaded = [
          ...(envId === currentEnv ? pendingUploadedMedia : []),
          ...(await uploadFilesToEnv(envId, pendingMediaFiles)),
        ];
        const data = attachMedia({ ...base }, uploaded);
        await api('/api/whatsnew?env=' + encodeURIComponent(envId), {
          method: 'POST',
          body: JSON.stringify({ data }),
        });
        results.ok.push(envId);
      } catch (err) {
        results.failed.push({ envId, error: err.hint || err.message });
      }
    }
  } finally {
    btn.disabled = false;
  }
  whatsNewByEnv.clear();
  await loadWhatsNewEntries();
  loadLogs();
  if (results.ok.length && !results.failed.length) {
    banner(`✓ Added "${base.version}" to ${results.ok.length} env${results.ok.length === 1 ? '' : 's'}: ${results.ok.map(envNameOf).join(', ')}.`, 'success');
    pendingMediaFiles = [];
    pendingUploadedMedia = [];
    renderMediaPreview();
  } else if (results.ok.length && results.failed.length) {
    banner(`Partial: ${results.ok.length} ok, ${results.failed.length} failed. ${results.failed[0].error}`, 'error');
  } else {
    banner(`Failed on all envs: ${results.failed[0]?.error || 'unknown'}`, 'error');
  }
  return !results.failed.length;
}

async function updateEntry() {
  if (!editingEntry) return;
  const base = validatedPayload();
  if (!base) return;
  const envId = editingEntry.envId;
  const btn = $('wn-update-btn');
  btn.disabled = true;
  try {
    // Existing media was uploaded to this env already; new files go to it too.
    const uploaded = [...pendingUploadedMedia, ...(await uploadFilesToEnv(envId, pendingMediaFiles))];
    const data = attachMedia({ ...base }, uploaded);
    await api('/api/whatsnew/' + encodeURIComponent(editingEntry.documentId) + '?env=' + encodeURIComponent(envId), {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
    banner(`✓ Updated v${data.version} on ${envNameOf(envId)}.`, 'success');
    whatsNewByEnv.delete(envId);
    setEditMode(null);
    pendingMediaFiles = [];
    pendingUploadedMedia = [];
    renderMediaPreview();
    await loadWhatsNewEntries();
    loadLogs();
  } catch (err) {
    banner(`Update failed: ${err.hint || err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Sync / export / import helpers ---------- */

async function syncWhatsNewAcrossEnvs() {
  if (!confirm('This will copy ALL entries from the current environment to the other environments. Continue?')) return;
  const source = whatsNewByEnv.get(currentEnv) || whatsNewEntries;
  if (!source.length) { banner('No entries to sync.', 'error'); return; }
  const targets = environments.filter((e) => e.id !== currentEnv);
  if (!targets.length) { banner('No other environments to sync to.', 'error'); return; }
  let count = 0;
  for (const t of targets) {
    for (const entry of source) {
      const data = {
        version: entry.version,
        platform: entry.platform,
        order: entry.order ?? 0,
        active: entry.active !== false,
        title: entry.title,
        description: entry.description,
      };
      // Carry over image/media ids if present
      const mediaIds = [];
      if (Array.isArray(entry.media)) for (const m of entry.media) if (m?.id) mediaIds.push(m.id);
      if (!mediaIds.length && entry.image?.id) mediaIds.push(entry.image.id);
      if (mediaIds.length) { data.image = mediaIds[0]; data.media = mediaIds; }
      try {
        await api('/api/whatsnew?env=' + encodeURIComponent(t.id), {
          method: 'POST', body: JSON.stringify({ data }),
        });
        count++;
      } catch { /* skip duplicates */ }
    }
  }
  whatsNewByEnv.clear();
  banner(`✓ Synced ${count} entries across ${targets.length} env${targets.length === 1 ? '' : 's'}.`, 'success');
  loadLogs();
}

function exportWhatsNewJson() {
  const envId = whatsNewEnvFilter || currentEnv;
  const json = JSON.stringify(whatsNewEntries, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whats-new-${envNameOf(envId)}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  banner(`Exported ${whatsNewEntries.length} entries from ${envNameOf(envId)}.`, 'success');
}

function importWhatsNewJson() {
  const text = $('wn-import-data').value.trim();
  const errEl = $('wn-import-error');
  errEl.classList.add('hidden');
  if (!text) { errEl.textContent = 'Paste JSON data first'; errEl.classList.remove('hidden'); return; }
  let entries;
  try { entries = JSON.parse(text); }
  catch (e) { errEl.textContent = `Invalid JSON: ${e.message}`; errEl.classList.remove('hidden'); return; }
  if (!Array.isArray(entries)) { errEl.textContent = 'JSON must be an array'; errEl.classList.remove('hidden'); return; }
  for (const entry of entries) if (!entry.version) { errEl.textContent = 'Each entry must have a version'; errEl.classList.remove('hidden'); return; }
  const targetEnv = whatsNewEnvFilter || currentEnv;
  if (!confirm(`Import ${entries.length} entries into ${envNameOf(targetEnv)}?`)) return;
  $('wn-import-area').classList.add('hidden');
  $('wn-import-data').value = '';
  (async () => {
    let ok = 0, failed = 0, lastErr = '';
    for (const entry of entries) {
      const data = {
        version: entry.version,
        platform: entry.platform || 'all',
        order: entry.order ?? 0,
        active: entry.active !== false,
        title: entry.title || '',
        description: entry.description || '',
      };
      try {
        await api('/api/whatsnew?env=' + encodeURIComponent(targetEnv), {
          method: 'POST', body: JSON.stringify({ data }),
        });
        ok++;
      } catch (e) { failed++; lastErr = e.hint || e.message; }
    }
    whatsNewByEnv.delete(targetEnv);
    await loadWhatsNewEntries();
    banner(`Imported ${ok}/${entries.length} entries${failed ? `, ${failed} failed (${lastErr})` : ''}.`, failed ? 'error' : 'success');
  })();
}

/* ---------- schedule presets ---------- */

function makeScheduler(prefix, cronId) {
  const apply = () => {
    const preset = $(`${prefix}-preset`).value;
    $(`${prefix}-wrap-n`).classList.toggle('hidden', !(preset === 'minutes' || preset === 'hours'));
    $(`${prefix}-wrap-time`).classList.toggle('hidden', preset !== 'daily');
    const cronEl = $(cronId);
    cronEl.readOnly = preset !== 'custom';
    cronEl.classList.toggle('readonly', preset !== 'custom');
    const n = Math.max(1, parseInt($(`${prefix}-interval-n`).value, 10) || 1);
    if (preset === 'minutes') cronEl.value = `*/${n} * * * *`;
    else if (preset === 'hours') cronEl.value = `0 */${n} * * *`;
    else if (preset === 'daily') {
      const [h, m] = ($(`${prefix}-daily-time`).value || '09:00').split(':');
      cronEl.value = `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
    }
    refreshUi();
  };
  $(`${prefix}-preset`).addEventListener('change', apply);
  $(`${prefix}-interval-n`).addEventListener('input', apply);
  $(`${prefix}-daily-time`).addEventListener('input', apply);
}

function resetPreset(prefix, cronId) {
  $(`${prefix}-preset`).value = 'custom';
  $(cronId).readOnly = false;
  $(`${prefix}-wrap-n`).classList.add('hidden');
  $(`${prefix}-wrap-time`).classList.add('hidden');
}

/* ---------- list editors (titles / descriptions) ---------- */

function renderListEditor(editorId) {
  const editor = $(editorId);
  const field = editor.dataset.field;
  const arr = listState[field];
  const listBox = editor.querySelector('[data-list]');
  const raw = editor.querySelector('[data-raw]');
  raw.value = arr.join('\n');

  if (!arr.length) {
    listBox.innerHTML = '<div class="chips-empty">Nothing yet — add at least one entry.</div>';
  } else {
    listBox.innerHTML = '';
    arr.forEach((text, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<span class="chip-text"></span><button type="button" class="chip-del" title="Remove">${svgIcon('x')}</button>`;
      chip.querySelector('.chip-text').textContent = text;
      chip.querySelector('.chip-del').addEventListener('click', () => {
        listState[field].splice(i, 1);
        renderListEditor(editorId);
        refreshUi();
      });
      listBox.appendChild(chip);
    });
  }
  refreshUi();
}

function setupListEditor(editorId) {
  const editor = $(editorId);
  const field = editor.dataset.field;
  const addInput = editor.querySelector('[data-add]');
  const addBtn = editor.querySelector('[data-add-btn]');
  const rawToggle = editor.querySelector('[data-toggle-raw]');
  const raw = editor.querySelector('[data-raw]');
  const listBox = editor.querySelector('[data-list]');
  const addRow = editor.querySelector('.list-add');

  const addEntries = () => {
    const parts = addInput.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    for (const p of parts) if (!listState[field].includes(p)) listState[field].push(p);
    addInput.value = '';
    renderListEditor(editorId);
  };
  addBtn.addEventListener('click', addEntries);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addEntries(); } });

  rawToggle.addEventListener('click', () => {
    const showRaw = raw.classList.contains('hidden');
    raw.classList.toggle('hidden', !showRaw);
    listBox.classList.toggle('hidden', showRaw);
    addRow.classList.toggle('hidden', showRaw);
    rawToggle.innerHTML = svgIcon('repeat') + (showRaw ? ' List mode' : ' Paste mode');
    if (!showRaw) renderListEditor(editorId);
  });

  raw.addEventListener('input', () => {
    listState[field] = raw.value.split('\n').map((s) => s.trim()).filter(Boolean);
    refreshUi();
  });
}

/* ---------- config load / save ---------- */

function fillActivityTypes(types, current) {
  const sel = $('activityType');
  sel.innerHTML = '';
  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    if (t === current) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function loadConfig() {
  const cfg = await api(withEnv('/api/config'));
  const tag = $('build-tag');
  if (tag) {
    tag.textContent = cfg.build ? `server: ${cfg.build}` : 'server: OLD — restart node!';
    tag.classList.toggle('stale', !cfg.build);
  }
  // schedules
  $('activitiesEnabled').checked = !!cfg.activitiesEnabled;
  $('activityCron').value = cfg.activityCron || '*/30 * * * *';
  $('eventsTrueEnabled').checked = !!cfg.eventsTrueEnabled;
  $('eventsTrueCron').value = cfg.eventsTrueCron || '0 */6 * * *';
  $('eventsTrueMin').value = cfg.eventsTrueMin ?? 1;
  $('eventsTrueMax').value = cfg.eventsTrueMax ?? 2;
  $('eventsFalseEnabled').checked = !!cfg.eventsFalseEnabled;
  $('eventsFalseCron').value = cfg.eventsFalseCron || '0 */12 * * *';
  $('eventsFalseMin').value = cfg.eventsFalseMin ?? 1;
  $('eventsFalseMax').value = cfg.eventsFalseMax ?? 1;
  // activities
  $('minDuration').value = cfg.minDurationMinutes ?? 30;
  $('maxDuration').value = cfg.maxDurationMinutes ?? 60;
  $('minMembers').value = cfg.minMembers ?? 1;
  $('maxMembers').value = cfg.maxMembers ?? 3;
  $('minActivities').value = cfg.minActivities || 1;
  $('maxActivities').value = cfg.maxActivities || 1;
  $('autoEnd').checked = cfg.autoEnd;
  $('attachDojo').checked = cfg.attachDojo;
  // shared event settings
  $('eventDurationMinutes').value = cfg.eventDurationMinutes ?? 120;
  $('eventFutureMinDays').value = cfg.eventFutureMinDays ?? 1;
  $('eventFutureMaxDays').value = cfg.eventFutureMaxDays ?? 30;
  $('eventAttachPhoto').checked = cfg.eventAttachPhoto !== false;
  $('eventAttachDojo').checked = cfg.eventAttachDojo !== false;
  listState.eventTitles = [...(cfg.eventTitles || [])];
  listState.eventDescriptions = [...(cfg.eventDescriptions || [])];
  renderListEditor('titles-editor');
  renderListEditor('descs-editor');
  fillActivityTypes(cfg.activityTypes || ['CUSTOM'], cfg.activityType);
  resetPreset('act', 'activityCron');
  resetPreset('evt', 'eventsTrueCron');
  resetPreset('evf', 'eventsFalseCron');

  selected.clear();
  (cfg.selectedUserIds || []).forEach((id) => selected.add(id));
  updateCount();
  savedSnapshot = JSON.stringify(formState());
  refreshUi();
}

async function save() {
  const targets = saveTargetEnvs.size ? [...saveTargetEnvs] : [currentEnv];
  const state = formState();
  const results = { ok: [], failed: [] };
  $('save').disabled = true;
  banner(`Saving to ${targets.length} environment${targets.length === 1 ? '' : 's'}…`, 'info');
  for (const envId of targets) {
    try {
      await api('/api/config', { method: 'PUT', body: JSON.stringify({ env: envId, ...state }) });
      results.ok.push(envId);
    } catch (err) {
      results.failed.push({ envId, error: err.message });
    }
  }
  $('save').disabled = false;
  savedSnapshot = JSON.stringify(state);
  refreshUi();
  if (results.ok.length && !results.failed.length) {
    banner(`✓ Saved to ${results.ok.map(envNameOf).join(', ')}. Settings persist across restarts.`, 'success');
  } else if (results.ok.length) {
    banner(`Saved to ${results.ok.length}, failed on ${results.failed.length}: ${results.failed[0].error}`, 'error');
  } else {
    banner(`Save failed: ${results.failed[0]?.error || 'unknown error'}`, 'error');
  }
  loadLogs();
}

/* ---------- multi-env "save to" picker (Activities / Events) ---------- */

function resetSaveTargets() {
  saveTargetEnvs.clear();
  if (currentEnv) saveTargetEnvs.add(currentEnv);
  renderSaveEnvList();
  updateSaveEnvSummary();
}

function renderSaveEnvList() {
  const list = $('save-env-list');
  if (!list) return;
  // Drop ids that no longer exist.
  [...saveTargetEnvs].forEach((id) => { if (!environments.find((e) => e.id === id)) saveTargetEnvs.delete(id); });
  if (!saveTargetEnvs.size && currentEnv) saveTargetEnvs.add(currentEnv);
  list.innerHTML = '';
  for (const e of environments) {
    const label = document.createElement('label');
    label.className = 'apply-env-chip';
    const isCurrent = e.id === currentEnv;
    label.innerHTML =
      `<input type="checkbox" value="${escapeHtml(e.id)}" ${saveTargetEnvs.has(e.id) ? 'checked' : ''} />` +
      `<span>${escapeHtml(e.name)}${isCurrent ? ' <em class="chip-you">current</em>' : ''}</span>`;
    label.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) saveTargetEnvs.add(e.id); else saveTargetEnvs.delete(e.id);
      updateSaveEnvSummary();
    });
    list.appendChild(label);
  }
}

function updateSaveEnvSummary() {
  const el = $('save-env-summary');
  if (!el) return;
  const n = saveTargetEnvs.size;
  if (n === 0) el.textContent = 'No env';
  else if (n === 1) el.textContent = envNameOf([...saveTargetEnvs][0]);
  else if (n === environments.length) el.textContent = `All ${n} envs`;
  else el.textContent = `${n} envs`;
  $('save').innerHTML = svgIcon('save') + (n > 1 ? ` Save to ${n} envs` : ' Save settings');
}

function toggleSaveEnvMenu(forceOpen) {
  const menu = $('save-env-menu');
  const willOpen = forceOpen ?? menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !willOpen);
  $('save-env-btn').setAttribute('aria-expanded', String(willOpen));
}

async function runNow(scope) {
  const label = scope === 'events' ? 'events' : 'activities';
  banner(`Running ${label} test on ${envName()}…`, 'info');
  $('run-now').disabled = true;
  try {
    const r = await api('/api/run-now', { method: 'POST', body: JSON.stringify({ env: currentEnv, scope }) });
    if (r.skipped) {
      const why = r.reason === 'no-users' ? 'select at least one user first' : r.reason;
      banner(`Skipped: ${why}.`, 'error');
    } else if (r.ok) {
      const parts = [];
      if (r.activitiesCreated) parts.push(`${r.activitiesCreated} activity(ies), ${r.totalMembers} member(s)`);
      if (r.eventsCreated) parts.push(`${r.eventsCreated} event(s)`);
      banner(`✓ Created ${parts.join(' + ') || 'nothing'}.`, 'success');
    } else {
      banner(`Nothing created${r.error ? `: ${r.error}` : '.'}`, 'error');
    }
    loadLogs();
  } catch (err) {
    banner(`Run failed: ${err.message}`, 'error');
  } finally {
    $('run-now').disabled = false;
  }
}

/* ---------- environments ---------- */

function envName() {
  return environments.find((e) => e.id === currentEnv)?.name || currentEnv || 'environment';
}

function toggleEnvMenu(forceOpen) {
  const menu = $('env-menu');
  const willOpen = forceOpen ?? menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !willOpen);
  $('env-current-btn').setAttribute('aria-expanded', String(willOpen));
  if (!willOpen) {
    $('env-add-form').classList.add('hidden');
    $('env-add-toggle').classList.remove('hidden');
  }
}

function renderEnvMenu() {
  $('env-current-name').textContent = envName();
  const list = $('env-list');
  list.innerHTML = '';
  environments.forEach((e) => {
    const item = document.createElement('div');
    item.className = 'env-item' + (e.id === currentEnv ? ' current' : '');
    const canDelete = environments.length > 1;
    item.innerHTML =
      `<span class="env-item-check">${e.id === currentEnv ? svgIcon('check') : ''}</span>` +
      `<span class="env-item-name"></span>` +
      (canDelete ? `<button type="button" class="env-item-del" title="Remove environment">${svgIcon('x')}</button>` : '');
    item.querySelector('.env-item-name').textContent = e.name;
    item.addEventListener('click', (ev) => {
      if (ev.target.closest('.env-item-del')) return;
      if (e.id !== currentEnv) onEnvChange(e.id);
      toggleEnvMenu(false);
    });
    const del = item.querySelector('.env-item-del');
    if (del) del.addEventListener('click', (ev) => { ev.stopPropagation(); removeEnv(e); });
    list.appendChild(item);
  });
}

async function loadEnvironments() {
  const data = await api('/api/environments');
  environments = data.environments || [];
  if (!environments.find((e) => e.id === currentEnv)) {
    currentEnv = data.defaultEnv || environments[0]?.id || null;
  }
  if (currentEnv) localStorage.setItem('env', currentEnv);
  // Default the version-entries env filter to the current env on first load
  if (!whatsNewEnvFilter) whatsNewEnvFilter = currentEnv;
  renderEnvMenu();
  populateEnvFilter();
  resetSaveTargets();
  renderWnTargetEnvs();
}

async function removeEnv(e) {
  if (!confirm(`Remove environment "${e.name}"? Its saved settings will be deleted.`)) return;
  try {
    const data = await api('/api/environments/' + encodeURIComponent(e.id), { method: 'DELETE' });
    environments = data.environments || [];
    if (!environments.find((x) => x.id === currentEnv)) {
      currentEnv = data.defaultEnv || environments[0]?.id || null;
    }
    if (currentEnv) localStorage.setItem('env', currentEnv);
    renderEnvMenu();
    populateEnvFilter();
    banner(`Removed ${e.name}.`, 'success');
    await loadEnvData();
  } catch (err) {
    banner(`Remove failed: ${err.message}`, 'error');
  }
}

async function addEnv(ev) {
  ev.preventDefault();
  const name = $('env-add-name').value.trim();
  const url = $('env-add-url').value.trim();
  const token = $('env-add-token').value.trim();
  const err = $('env-add-err');
  err.classList.add('hidden');
  try {
    const data = await api('/api/environments', { method: 'POST', body: JSON.stringify({ name, url, token }) });
    environments = data.environments || [];
    currentEnv = data.added?.id || currentEnv;
    localStorage.setItem('env', currentEnv);
    $('env-add-name').value = '';
    $('env-add-url').value = '';
    $('env-add-token').value = '';
    renderEnvMenu();
    populateEnvFilter();
    toggleEnvMenu(false);
    banner(`✓ Added environment "${data.added?.name}".`, 'success');
    await loadEnvData();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
}

async function onEnvChange(id) {
  currentEnv = id;
  localStorage.setItem('env', id);
  renderEnvMenu();
  resetSaveTargets();
  wnTargetEnvs.clear();
  wnTargetEnvs.add(id);
  renderWnTargetEnvs();
  banner(`Switched to ${envName()}.`, 'info');
  await loadEnvData();
}

async function loadEnvData() {
  try {
    await loadConfig();
  } catch (err) {
    banner(`Could not load config: ${err.message}`, 'error');
  }
  try {
    allUsers = await api(withEnv('/api/users'));
    [...selected].forEach((id) => { if (!allUsers.find((u) => u.id === id)) selected.delete(id); });
    notifSelected.clear();
    renderUsers();
    renderNotifUsers();
    refreshUi();
    refreshNotify();
  } catch (err) {
    const msg = `⚠ Failed to load users for ${envName()}: ${err.message}. Check the environment's URL / token.`;
    allUsers = [];
    $('users').innerHTML = `<span class="loading err">${msg}</span>`;
    $('notif-users').innerHTML = `<span class="loading err">${msg}</span>`;
  }
  loadLogs();
  loadWhatsNewEntries();
}

/* ---------- logs ---------- */

function logDetail(e) {
  const bits = [];
  if (e.host) bits.push(`host: ${e.host}`);
  if (e.owner) bits.push(`owner: ${e.owner}`);
  if (e.isEvent != null) bits.push(e.isEvent ? 'isEvent: true' : 'isEvent: false');
  if (e.memberCount != null) bits.push(`${e.memberCount} member(s)`);
  if (e.location?.name) bits.push(`${svgIcon('map-pin')} ${e.location.name}`);
  if (e.dojoId != null) bits.push(`dojo #${e.dojoId}`);
  if (e.hasPhoto) bits.push(`${svgIcon('camera')} photo`);
  if (e.startTime) bits.push(`starts ${new Date(e.startTime).toLocaleString()}`);
  if (e.recipients != null) bits.push(`${e.recipients} recipient(s)`);
  return bits.join(' · ');
}

async function loadLogs() {
  try {
    const path = $('log-env-only').checked ? withEnv('/api/logs') : '/api/logs';
    const logs = await api(path);
    const filter = $('log-filter').value;
    const shown = filter === 'all' ? logs : logs.filter((e) => e.level === filter);
    const ul = $('logs');
    const countEl = $('log-count');
    if (countEl) countEl.textContent = shown.length;
    if (!shown.length) { ul.innerHTML = '<li class="muted">No matching log entries.</li>'; return; }
    ul.innerHTML = '';
    for (const e of shown) {
      const li = document.createElement('li');
      li.className = `log ${e.level}`;
      const t = new Date(e.time).toLocaleTimeString();
      const detail = logDetail(e);
      const envTag = e.envName ? `<span class="log-env">${e.envName}</span>` : '';
      li.innerHTML =
        `<span class="log-badge">${e.level}</span>` +
        `<span class="log-time">${t}</span>` + envTag +
        `<span class="log-msg">${e.message}${detail ? ` <span class="log-detail">— ${detail}</span>` : ''}</span>`;
      ul.appendChild(li);
    }
  } catch (err) {
    $('logs').innerHTML = `<li class="log error">Could not load logs: ${err.message}</li>`;
  }
}

function setupAutoRefresh() {
  if (logTimer) clearInterval(logTimer);
  logTimer = setInterval(() => { if ($('auto-refresh').checked) loadLogs(); }, 5000);
}

/* ---------- boot ---------- */

async function init() {
  injectIcons();
  applyTheme(localStorage.getItem('theme') || 'dark');
  document.querySelectorAll('.theme-btn').forEach((b) =>
    b.addEventListener('click', () => applyTheme(b.dataset.themeValue)),
  );

  const authenticated = await checkAuth();
  if (!authenticated) showLoginScreen();
  else { hideLoginScreen(); await initializeApp(); }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const errorEl = $('login-error');
    try {
      errorEl.classList.add('hidden');
      await login(username, password);
      hideLoginScreen();
      await initializeApp();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });

  $('logout-btn').addEventListener('click', logout);
}

let appInitialized = false;
async function initializeApp() {
  if (!appInitialized) {
    appInitialized = true;

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    makeScheduler('act', 'activityCron');
    makeScheduler('evt', 'eventsTrueCron');
    makeScheduler('evf', 'eventsFalseCron');
    setupListEditor('titles-editor');
    setupListEditor('descs-editor');

    $('user-search').addEventListener('input', renderUsers);
    [
      'activitiesEnabled', 'activityCron',
      'eventsTrueEnabled', 'eventsTrueCron', 'eventsTrueMin', 'eventsTrueMax',
      'eventsFalseEnabled', 'eventsFalseCron', 'eventsFalseMin', 'eventsFalseMax',
      'minDuration', 'maxDuration', 'minMembers', 'maxMembers', 'minActivities', 'maxActivities',
      'activityType', 'autoEnd', 'attachDojo',
      'eventDurationMinutes', 'eventFutureMinDays', 'eventFutureMaxDays', 'eventAttachPhoto', 'eventAttachDojo',
    ].forEach((id) => {
      $(id).addEventListener('input', refreshUi);
      $(id).addEventListener('change', refreshUi);
    });

    $('select-all').addEventListener('click', () => { allUsers.forEach((u) => selected.add(u.id)); renderUsers(); refreshUi(); });
    $('clear-all').addEventListener('click', () => { selected.clear(); renderUsers(); refreshUi(); });
    $('save').addEventListener('click', save);
    $('run-now').addEventListener('click', () => runNow(activeTab === 'events' ? 'events' : 'activities'));

    // multi-env "save to" picker
    $('save-env-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleSaveEnvMenu(); });
    $('save-env-all').addEventListener('click', () => {
      environments.forEach((env) => saveTargetEnvs.add(env.id));
      renderSaveEnvList(); updateSaveEnvSummary();
    });
    $('save-env-current').addEventListener('click', () => {
      saveTargetEnvs.clear(); if (currentEnv) saveTargetEnvs.add(currentEnv);
      renderSaveEnvList(); updateSaveEnvSummary();
    });
    document.addEventListener('click', (e) => {
      if (!$('save-env-multi').contains(e.target)) toggleSaveEnvMenu(false);
    });

    // environment manager
    $('env-current-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleEnvMenu(); });
    $('env-add-toggle').addEventListener('click', () => {
      $('env-add-form').classList.remove('hidden');
      $('env-add-toggle').classList.add('hidden');
      $('env-add-name').focus();
    });
    $('env-add-cancel').addEventListener('click', () => {
      $('env-add-form').classList.add('hidden');
      $('env-add-toggle').classList.remove('hidden');
      $('env-add-err').classList.add('hidden');
    });
    $('env-add-form').addEventListener('submit', addEnv);
    document.addEventListener('click', (e) => {
      if (!$('env-picker').contains(e.target)) toggleEnvMenu(false);
    });

    // notifications
    $('notif-search').addEventListener('input', renderNotifUsers);
    $('only-token').addEventListener('change', renderNotifUsers);
    $('notif-title').addEventListener('input', refreshNotify);
    $('notif-body').addEventListener('input', refreshNotify);
    document.querySelectorAll('input[name="notif-mode"]').forEach((r) => r.addEventListener('change', refreshNotify));
    $('notif-select-all').addEventListener('click', () => { allUsers.filter((u) => u.hasToken).forEach((u) => notifSelected.add(u.id)); renderNotifUsers(); refreshNotify(); });
    $('notif-clear-all').addEventListener('click', () => { notifSelected.clear(); renderNotifUsers(); refreshNotify(); });
    $('send-notif').addEventListener('click', sendNotification);

    // logs
    $('log-filter').addEventListener('change', loadLogs);
    $('log-env-only').addEventListener('change', loadLogs);
    $('refresh-logs').addEventListener('click', loadLogs);

    // What's New tab event listeners
    $('wn-add-btn').addEventListener('click', () => {
      const targets = readWnTargets();
      if (!targets.length) { banner('Pick at least one environment to create on.', 'error'); return; }
      createEntry(targets);
    });
    $('wn-update-btn').addEventListener('click', updateEntry);
    $('wn-cancel-edit-btn').addEventListener('click', () => { setEditMode(null); pendingUploadedMedia = []; renderMediaPreview(); });
    $('wn-clear-btn').addEventListener('click', clearWhatsNewForm);
    $('wn-target-all').addEventListener('click', () => {
      environments.forEach((e) => wnTargetEnvs.add(e.id));
      renderWnTargetEnvs();
    });
    $('wn-target-current').addEventListener('click', () => {
      wnTargetEnvs.clear();
      if (currentEnv) wnTargetEnvs.add(currentEnv);
      renderWnTargetEnvs();
    });
    $('wn-env-filter').addEventListener('change', (e) => {
      whatsNewEnvFilter = e.target.value || currentEnv;
      whatsNewEntries = whatsNewByEnv.get(whatsNewEnvFilter) || [];
      loadWhatsNewEntries();
    });
    $('wn-search').addEventListener('input', renderWhatsNewList);
    $('wn-version-filter').addEventListener('change', renderWhatsNewList);
    $('wn-sort').addEventListener('change', renderWhatsNewList);
    $('wn-filter-active').addEventListener('change', renderWhatsNewList);
    $('wn-refresh').addEventListener('click', () => { whatsNewByEnv.delete(whatsNewEnvFilter || currentEnv); loadWhatsNewEntries(); });
    $('wn-sync-all').addEventListener('click', syncWhatsNewAcrossEnvs);
    $('wn-export').addEventListener('click', exportWhatsNewJson);
    $('wn-import-toggle').addEventListener('click', () => {
      $('wn-import-area').classList.toggle('hidden');
    });
    $('wn-import-cancel').addEventListener('click', () => {
      $('wn-import-area').classList.add('hidden');
      $('wn-import-data').value = '';
      $('wn-import-error').classList.add('hidden');
    });
    $('wn-import-confirm').addEventListener('click', importWhatsNewJson);

    wireMediaDropzone();
    renderMediaPreview();

    switchTab('activities');
    setupAutoRefresh();
  }

  try {
    await loadEnvironments();
  } catch (err) {
    banner(`Could not load environments: ${err.message}`, 'error');
  }
  await loadEnvData();
}

init();

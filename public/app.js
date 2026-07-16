/* Settings UI logic — talks only to the bot's own /api endpoints. */

const $ = (id) => document.getElementById(id);

let allUsers = [];
const selected = new Set(); // activity pool
const notifSelected = new Set(); // notification recipients
let savedSnapshot = null;
let logTimer = null;
let authToken = localStorage.getItem('authToken') || null;

/* ---------- helpers ---------- */

function banner(message, type = 'info') {
  const el = $('banner');
  el.textContent = message;
  el.className = `banner ${type}`;
  if (!message) el.classList.add('hidden');
  else {
    el.classList.remove('hidden');
    if (type !== 'error') setTimeout(() => el.classList.add('hidden'), 4000);
  }
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const res = await fetch(path, { ...options, headers });
  
  // Handle 401 by redirecting to login
  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }
  
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function login(username, password) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    authToken = data.token;
    localStorage.setItem('authToken', authToken);
    return true;
  } catch (err) {
    throw err;
  }
}

async function logout() {
  authToken = null;
  localStorage.removeItem('authToken');
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
  } catch {}
  showLoginScreen();
}

async function checkAuth() {
  if (!authToken) return false;
  try {
    const res = await fetch('/api/auth', {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const data = await res.json();
    return data.authenticated;
  } catch {
    return false;
  }
}

function showLoginScreen() {
  $('login-screen').classList.remove('hidden');
  $('tabs').classList.add('hidden');
  document.querySelectorAll('main').forEach(el => el.classList.add('hidden'));
  const logsWrap = document.querySelector('.logs-wrap');
  if (logsWrap) logsWrap.classList.add('hidden');
  $('logout-btn').classList.add('hidden');
}

function hideLoginScreen() {
  $('login-screen').classList.add('hidden');
  $('tabs').classList.remove('hidden');
  $('activities-actionbar').classList.remove('hidden');
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

/** Parse cron expression and return detailed breakdown */
function parseCronDetails(expr) {
  const c = (expr || '').trim();
  const parts = c.split(/\s+/);
  if (parts.length !== 5) return null;
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  const explainField = (field, name, min, max) => {
    if (field === '*') return `${name}: Every value (${min}-${max})`;
    if (field.startsWith('*/')) {
      const step = field.slice(2);
      return `${name}: Every ${step} ${name.toLowerCase()} (starting at ${min})`;
    }
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return `${name}: From ${start} to ${end}`;
    }
    if (field.includes(',')) {
      return `${name}: Specific values: ${field}`;
    }
    return `${name}: At ${field}`;
  };
  
  return [
    explainField(minute, 'Minute', 0, 59),
    explainField(hour, 'Hour', 0, 23),
    explainField(dayOfMonth, 'Day of month', 1, 31),
    explainField(month, 'Month', 1, 12),
    explainField(dayOfWeek, 'Day of week', 0, 6),
  ];
}

function renderCronDetails(expr) {
  const details = parseCronDetails(expr);
  const container = $('cron-details');
  if (!details) {
    container.innerHTML = '<span class="muted">Invalid cron expression</span>';
    return;
  }
  container.innerHTML = details.map(d => `<div>${d}</div>`).join('');
}

const tokenCount = () => allUsers.filter((u) => u.hasToken).length;

/* ---------- tabs ---------- */

let activeTab = 'activities';

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === name),
  );
  $('panel-activities').classList.toggle('hidden', name !== 'activities');
  $('panel-events').classList.toggle('hidden', name !== 'events');
  $('panel-notify').classList.toggle('hidden', name !== 'notify');
  // Save/Run bar applies to the whole config (activities + events).
  $('activities-actionbar').classList.toggle('hidden', name === 'notify');
  // Run now is scoped to the tab you're on.
  $('run-now').textContent =
    name === 'events' ? '▶ Run events now (test)' : '▶ Run activities now (test)';
}

/* ---------- current form state (activities) ---------- */

function linesToArray(text) {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function formState() {
  return {
    enabled: $('enabled').checked,
    cron: $('cron').value.trim(),
    // activities
    activitiesEnabled: $('activitiesEnabled').checked,
    minDurationMinutes: parseInt($('minDuration').value, 10) || 1,
    maxDurationMinutes: parseInt($('maxDuration').value, 10) || 1,
    minMembers: parseInt($('minMembers').value, 10) || 0,
    maxMembers: parseInt($('maxMembers').value, 10) || 0,
    minActivities: parseInt($('minActivities').value, 10) || 1,
    maxActivities: parseInt($('maxActivities').value, 10) || 1,
    activityType: $('activityType').value,
    autoEnd: $('autoEnd').checked,
    attachDojo: $('attachDojo').checked,
    // events
    eventsEnabled: $('eventsEnabled').checked,
    minEvents: parseInt($('minEvents').value, 10) || 0,
    maxEvents: parseInt($('maxEvents').value, 10) || 0,
    eventIsEventRatio: parseInt($('eventIsEventRatio').value, 10) || 0,
    eventDurationMinutes: parseInt($('eventDurationMinutes').value, 10) || 1,
    eventFutureMinDays: parseInt($('eventFutureMinDays').value, 10) || 0,
    eventFutureMaxDays: parseInt($('eventFutureMaxDays').value, 10) || 0,
    eventAttachPhoto: $('eventAttachPhoto').checked,
    eventAttachDojo: $('eventAttachDojo').checked,
    eventTitles: linesToArray($('eventTitles').value),
    eventDescriptions: linesToArray($('eventDescriptions').value),
    selectedUserIds: [...selected].sort((a, b) => a - b),
  };
}
const isDirty = () => savedSnapshot !== null && JSON.stringify(formState()) !== savedSnapshot;

function refreshUi() {
  const s = formState();
  const pill = $('status-pill');
  pill.classList.toggle('on', s.enabled);
  pill.classList.toggle('off', !s.enabled);
  $('status-text').textContent = s.enabled ? 'Running on schedule' : 'Paused';

  $('sum-state').textContent = s.enabled ? 'Enabled' : 'Disabled';
  $('sum-state').className = 'stat-value ' + (s.enabled ? 'good' : 'warn');
  $('sum-schedule').textContent = cronToHuman(s.cron);
  $('sum-duration').textContent =
    s.minDurationMinutes === s.maxDurationMinutes
      ? `${s.minDurationMinutes} min`
      : `${s.minDurationMinutes}–${s.maxDurationMinutes} min`;
  $('sum-members').textContent =
    s.minMembers === s.maxMembers ? `${s.minMembers}` : `${s.minMembers}–${s.maxMembers}`;
  $('sum-pool').textContent = `${selected.size} selected`;
  $('sum-autoend').textContent = s.autoEnd ? 'Auto-end' : 'Stay active';
  $('cron-human').textContent = `${cronToHuman(s.cron)} · Asia/Jerusalem time`;
  
  // Render cron details
  renderCronDetails(s.cron);

  // events summary
  $('esum-state').textContent = s.eventsEnabled ? 'Enabled' : 'Disabled';
  $('esum-state').className = 'stat-value ' + (s.eventsEnabled ? 'good' : 'warn');
  $('esum-count').textContent =
    s.minEvents === s.maxEvents ? `${s.minEvents}` : `${s.minEvents}–${s.maxEvents}`;
  $('esum-ratio').textContent = `${s.eventIsEventRatio}%`;
  $('esum-window').textContent =
    s.eventFutureMinDays === s.eventFutureMaxDays
      ? `${s.eventFutureMinDays}d ahead`
      : `${s.eventFutureMinDays}–${s.eventFutureMaxDays}d ahead`;
  $('esum-photo').textContent = s.eventAttachPhoto ? 'On' : 'Off';
  $('esum-pool').textContent = `${selected.size} selected`;

  const dirty = isDirty();
  $('dirty-note').classList.toggle('hidden', !dirty);
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
function updateCount() {
  $('selected-count').textContent = `${selected.size} selected`;
}

/** Build a user row bound to a given selection Set. */
function userRow(u, set, onCount, onChange, { tokenOnly = false } = {}) {
  const row = document.createElement('label');
  const disabled = tokenOnly && !u.hasToken;
  row.className = 'user' + (set.has(u.id) ? ' on' : '') + (disabled ? ' disabled' : '');
  const avatar = u.avatarUrl
    ? `<img src="${u.avatarUrl}" alt="" loading="lazy" />`
    : `<span class="avatar-fallback">${(u.name[0] || '?').toUpperCase()}</span>`;
  const badge = u.hasToken ? '<span class="tok" title="Has a device token">📱</span>' : '';
  row.innerHTML = `
    <input type="checkbox" ${set.has(u.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
    ${avatar}
    <span class="uname" title="${u.name}">${u.name}</span>
    ${badge}
    <span class="uid">#${u.id}</span>`;
  row.querySelector('input').addEventListener('change', (e) => {
    if (e.target.checked) set.add(u.id);
    else set.delete(u.id);
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
  for (const u of list)
    box.appendChild(userRow(u, notifSelected, updateNotifCount, refreshNotify, { tokenOnly }));
  updateNotifCount();
}
function updateNotifCount() {
  $('notif-selected-count').textContent = `${notifSelected.size} selected`;
}

function currentNotifMode() {
  return document.querySelector('input[name="notif-mode"]:checked').value;
}

function refreshNotify() {
  const mode = currentNotifMode();
  const total = tokenCount();
  $('notif-target-count').textContent = `${total} with a token`;
  $('notif-picker').classList.toggle('hidden', mode === 'all');
  const allNote = $('notif-all-note');
  allNote.classList.toggle('hidden', mode !== 'all');
  if (mode === 'all') allNote.textContent = `Will send to all ${total} user(s) that have a device token.`;

  // count valid recipients
  let recipients;
  if (mode === 'all') recipients = total;
  else recipients = [...notifSelected].filter((id) => allUsers.find((u) => u.id === id)?.hasToken).length;

  const hasMsg = $('notif-title').value.trim() || $('notif-body').value.trim();
  $('notif-hint').textContent = !hasMsg
    ? 'Compose a title or message.'
    : `${recipients} recipient(s) with a token ready.`;
  $('send-notif').disabled = !hasMsg || recipients === 0;
}

async function sendNotification() {
  const mode = currentNotifMode();
  const body = {
    title: $('notif-title').value.trim(),
    body: $('notif-body').value.trim(),
    mode,
    userIds: mode === 'selected' ? [...notifSelected] : [],
  };
  $('send-notif').disabled = true;
  banner('Sending notification…', 'info');
  try {
    const r = await api('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.sent > 0)
      banner(`✓ Sent to ${r.sent} device(s). ${r.failed ? r.failed + ' failed. ' : ''}${r.skipped ? r.skipped + ' had no token.' : ''}`, 'success');
    else banner(`Nothing sent. ${r.skipped ? r.skipped + ' recipient(s) had no token.' : 'No valid recipients.'}`, 'error');
    loadLogs();
  } catch (err) {
    banner(`Send failed: ${err.message}`, 'error');
  }
  refreshNotify();
}

/* ---------- schedule preset -> cron ---------- */

function applyPreset() {
  const preset = $('preset').value;
  $('wrap-n').classList.toggle('hidden', !(preset === 'minutes' || preset === 'hours'));
  $('wrap-time').classList.toggle('hidden', preset !== 'daily');
  $('cron').readOnly = preset !== 'custom';
  $('cron').classList.toggle('readonly', preset !== 'custom');
  const n = Math.max(1, parseInt($('interval-n').value, 10) || 1);
  if (preset === 'minutes') $('cron').value = `*/${n} * * * *`;
  else if (preset === 'hours') $('cron').value = `0 */${n} * * *`;
  else if (preset === 'daily') {
    const [h, m] = ($('daily-time').value || '09:00').split(':');
    $('cron').value = `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
  }
  refreshUi();
}

/* ---------- config load / save ---------- */

function fillActivityTypes(types, current) {
  const sel = $('activityType');
  sel.innerHTML = '';
  for (const t of types) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === current) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function loadConfig() {
  const cfg = await api('/api/config');
  // Reflect the RUNNING server's build (not static files) so a stale, un-restarted
  // process is obvious. Old servers don't return `build`.
  const tag = $('build-tag');
  if (tag) {
    tag.textContent = cfg.build ? `server: ${cfg.build}` : 'server: OLD — restart node!';
    tag.classList.toggle('stale', !cfg.build);
  }
  $('enabled').checked = cfg.enabled;
  $('cron').value = cfg.cron;
  $('minDuration').value = cfg.minDurationMinutes ?? 30;
  $('maxDuration').value = cfg.maxDurationMinutes ?? 60;
  $('minMembers').value = cfg.minMembers;
  $('maxMembers').value = cfg.maxMembers;
  $('minActivities').value = cfg.minActivities || 1;
  $('maxActivities').value = cfg.maxActivities || 1;
  $('activitiesEnabled').checked = cfg.activitiesEnabled !== false;
  $('autoEnd').checked = cfg.autoEnd;
  $('attachDojo').checked = cfg.attachDojo;
  // events
  $('eventsEnabled').checked = !!cfg.eventsEnabled;
  $('minEvents').value = cfg.minEvents ?? 1;
  $('maxEvents').value = cfg.maxEvents ?? 2;
  $('eventIsEventRatio').value = cfg.eventIsEventRatio ?? 50;
  $('eventDurationMinutes').value = cfg.eventDurationMinutes ?? 120;
  $('eventFutureMinDays').value = cfg.eventFutureMinDays ?? 1;
  $('eventFutureMaxDays').value = cfg.eventFutureMaxDays ?? 30;
  $('eventAttachPhoto').checked = cfg.eventAttachPhoto !== false;
  $('eventAttachDojo').checked = cfg.eventAttachDojo !== false;
  $('eventTitles').value = (cfg.eventTitles || []).join('\n');
  $('eventDescriptions').value = (cfg.eventDescriptions || []).join('\n');
  fillActivityTypes(cfg.activityTypes || ['CUSTOM'], cfg.activityType);
  selected.clear();
  (cfg.selectedUserIds || []).forEach((id) => selected.add(id));
  updateCount();
  savedSnapshot = JSON.stringify(formState());
  refreshUi();
}

async function save() {
  try {
    await api('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formState()),
    });
    savedSnapshot = JSON.stringify(formState());
    refreshUi();
    banner('✓ Settings saved and schedule updated.', 'success');
  } catch (err) {
    banner(`Save failed: ${err.message}`, 'error');
  }
}

async function runNow(scope = 'activities') {
  const kind = scope === 'events' ? 'event' : 'activity';
  banner(`Running ${kind} test…`, 'info');
  $('run-now').disabled = true;
  try {
    const r = await api('/api/run-now', { method: 'POST', body: JSON.stringify({ scope }) });
    if (r.skipped) {
      const why = r.reason === 'no-users'
        ? 'select at least one user first'
        : r.reason === 'nothing-enabled'
          ? `enable ${kind}s first`
          : r.reason;
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

/* ---------- logs ---------- */

function logDetail(e) {
  const bits = [];
  if (e.host) bits.push(`host: ${e.host}`);
  if (e.owner) bits.push(`owner: ${e.owner}`);
  if (e.isEvent != null) bits.push(e.isEvent ? 'isEvent: true' : 'isEvent: false');
  if (e.memberCount != null) bits.push(`${e.memberCount} member(s)`);
  if (e.location?.name) bits.push(`📍 ${e.location.name}`);
  if (e.dojoId != null) bits.push(`dojo #${e.dojoId}`);
  if (e.hasPhoto) bits.push('📷 photo');
  if (e.startTime) bits.push(`starts ${new Date(e.startTime).toLocaleString()}`);
  if (e.recipients != null) bits.push(`${e.recipients} recipient(s)`);
  return bits.join(' · ');
}

async function loadLogs() {
  try {
    const logs = await api('/api/logs');
    const filter = $('log-filter').value;
    const shown = filter === 'all' ? logs : logs.filter((e) => e.level === filter);
    const ul = $('logs');
    if (!shown.length) {
      ul.innerHTML = '<li class="muted">No matching log entries.</li>';
      return;
    }
    ul.innerHTML = '';
    for (const e of shown) {
      const li = document.createElement('li');
      li.className = `log ${e.level}`;
      const t = new Date(e.time).toLocaleTimeString();
      const detail = logDetail(e);
      li.innerHTML =
        `<span class="log-badge">${e.level}</span>` +
        `<span class="log-time">${t}</span>` +
        `<span class="log-msg">${e.message}${detail ? ` <span class="log-detail">— ${detail}</span>` : ''}</span>`;
      ul.appendChild(li);
    }
  } catch (err) {
    $('logs').innerHTML = `<li class="log error">Could not load logs: ${err.message}</li>`;
  }
}

function setupAutoRefresh() {
  if (logTimer) clearInterval(logTimer);
  logTimer = setInterval(() => {
    if ($('auto-refresh').checked) loadLogs();
  }, 5000);
}

/* ---------- boot ---------- */

async function init() {
  // Check auth first
  const authenticated = await checkAuth();
  
  if (!authenticated) {
    showLoginScreen();
  } else {
    hideLoginScreen();
    await initializeApp();
  }
  
  // Login form handler
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
  
  // Logout button
  $('logout-btn').addEventListener('click', logout);
}

async function initializeApp() {
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab)),
  );

  $('preset').addEventListener('change', applyPreset);
  $('interval-n').addEventListener('input', applyPreset);
  $('daily-time').addEventListener('input', applyPreset);
  $('user-search').addEventListener('input', renderUsers);
  [
    'enabled', 'cron', 'minDuration', 'maxDuration', 'minMembers', 'maxMembers', 'minActivities',
    'maxActivities', 'activityType', 'activitiesEnabled', 'autoEnd', 'attachDojo',
    'eventsEnabled', 'minEvents', 'maxEvents', 'eventIsEventRatio', 'eventDurationMinutes',
    'eventFutureMinDays', 'eventFutureMaxDays', 'eventAttachPhoto', 'eventAttachDojo',
    'eventTitles', 'eventDescriptions',
  ].forEach((id) => {
    $(id).addEventListener('input', refreshUi);
    $(id).addEventListener('change', refreshUi);
  });
  $('select-all').addEventListener('click', () => {
    allUsers.forEach((u) => selected.add(u.id));
    renderUsers();
    refreshUi();
  });
  $('clear-all').addEventListener('click', () => {
    selected.clear();
    renderUsers();
    refreshUi();
  });
  $('save').addEventListener('click', save);
  $('run-now').addEventListener('click', () =>
    runNow(activeTab === 'events' ? 'events' : 'activities'),
  );

  // notifications
  $('notif-search').addEventListener('input', renderNotifUsers);
  $('only-token').addEventListener('change', renderNotifUsers);
  $('notif-title').addEventListener('input', refreshNotify);
  $('notif-body').addEventListener('input', refreshNotify);
  document.querySelectorAll('input[name="notif-mode"]').forEach((r) =>
    r.addEventListener('change', refreshNotify),
  );
  $('notif-select-all').addEventListener('click', () => {
    allUsers.filter((u) => u.hasToken).forEach((u) => notifSelected.add(u.id));
    renderNotifUsers();
    refreshNotify();
  });
  $('notif-clear-all').addEventListener('click', () => {
    notifSelected.clear();
    renderNotifUsers();
    refreshNotify();
  });
  $('send-notif').addEventListener('click', sendNotification);

  // logs
  $('log-filter').addEventListener('change', loadLogs);
  $('refresh-logs').addEventListener('click', loadLogs);

  try {
    await loadConfig();
  } catch (err) {
    banner(`Could not load config: ${err.message}`, 'error');
  }

  try {
    allUsers = await api('/api/users');
    renderUsers();
    renderNotifUsers();
    refreshUi();
    refreshNotify();
  } catch (err) {
    const msg = `⚠ Failed to load users: ${err.message}. Check STRAPI_API_URL / STRAPI_TOKEN on the server.`;
    $('users').innerHTML = `<span class="loading err">${msg}</span>`;
    $('notif-users').innerHTML = `<span class="loading err">${msg}</span>`;
  }

  loadLogs();
  setupAutoRefresh();
}

init();

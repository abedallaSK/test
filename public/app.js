/* Settings UI logic — talks only to the bot's own /api endpoints. */

const $ = (id) => document.getElementById(id);

let allUsers = [];
const selected = new Set(); // activity pool (per current env)
const notifSelected = new Set(); // notification recipients
let savedSnapshot = null;
let logTimer = null;
let authToken = localStorage.getItem('authToken') || null;

let environments = []; // [{id, name}]
let currentEnv = localStorage.getItem('env') || null;

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
  el.textContent = message;
  el.className = `banner ${type}`;
  if (!message) el.classList.add('hidden');
  else {
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
  $('run-now').textContent = name === 'events' ? '▶ Run events now' : '▶ Run activities now';
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
  const badge = u.hasToken ? '<span class="tok" title="Has a device token">📱</span>' : '';
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

let whatsNewEntries = [];
let pendingMediaFiles = []; // Store files to be uploaded

async function loadWhatsNewEntries() {
  try {
    const data = await api(withEnv('/api/whatsnew'));
    whatsNewEntries = Array.isArray(data) ? data : (data?.data || []);
    renderWhatsNewList();
    updateWhatsNewSummary();
  } catch (err) {
    whatsNewEntries = [];
    $('wn-list').innerHTML = `<span class="loading err">⚠ Failed to load: ${err.message}</span>`;
  }
}

function renderWhatsNewList() {
  const q = $('wn-search').value.trim().toLowerCase();
  const activeOnly = $('wn-filter-active').checked;
  const box = $('wn-list');
  
  let filtered = whatsNewEntries;
  if (activeOnly) filtered = filtered.filter(e => e.active !== false);
  if (q) filtered = filtered.filter(e => 
    (e.version || '').toLowerCase().includes(q) ||
    (e.title || '').toLowerCase().includes(q) ||
    (e.description || '').toLowerCase().includes(q)
  );
  
  if (!filtered.length) {
    box.innerHTML = '<div class="wn-empty-state">No entries found. Add your first version entry above!</div>';
    return;
  }
  
  filtered.sort((a, b) => (b.order || 0) - (a.order || 0) || (b.version || '').localeCompare(a.version || ''));
  
  box.innerHTML = '';
  filtered.forEach((entry, idx) => {
    const card = document.createElement('div');
    card.className = 'wn-entry' + (entry.active === false ? ' inactive' : '');
    
    const platformClass = (entry.platform || 'all').toLowerCase();
    const imageUrl = entry.image?.url || entry.image?.formats?.thumbnail?.url || entry.image?.formats?.small?.url;
    const imageHtml = imageUrl 
      ? `<img src="${imageUrl}" alt="" class="wn-entry-image" loading="lazy" />` 
      : '';
    
    card.innerHTML = `
      <div class="wn-entry-main">
        <div class="wn-entry-header">
          <span class="wn-version-badge">${escapeHtml(entry.version || 'v?')}</span>
          <span class="wn-platform-badge ${platformClass}">${entry.platform || 'all'}</span>
          ${entry.active === false ? '<span class="wn-platform-badge" style="background:var(--warn);color:#fff">Inactive</span>' : ''}
        </div>
        <h4 class="wn-entry-title">${escapeHtml(entry.title || 'Untitled')}</h4>
        <p class="wn-entry-desc">${escapeHtml(entry.description || 'No description')}</p>
        <div class="wn-entry-meta">
          <span>Order: ${entry.order ?? 0}</span>
          ${imageHtml ? '<span>📷 Has image</span>' : ''}
        </div>
        ${imageHtml}
      </div>
      <div class="wn-entry-actions">
        <button type="button" class="ghost" onclick="editWhatsNewEntry(${idx})" title="Edit">✏️ Edit</button>
        <button type="button" class="ghost" onclick="toggleWhatsNewActive(${idx})" title="Toggle Active">${entry.active === false ? '✅ Activate' : '⏸️ Deactivate'}</button>
        <button type="button" class="ghost" style="color:var(--danger)" onclick="deleteWhatsNewEntry(${idx})" title="Delete">🗑️ Delete</button>
      </div>
    `;
    box.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateWhatsNewSummary() {
  const total = whatsNewEntries.length;
  const active = whatsNewEntries.filter(e => e.active !== false).length;
  const latest = whatsNewEntries.length 
    ? [...whatsNewEntries].sort((a, b) => (b.order ?? 0) - (a.order ?? 0) || (b.version || '').localeCompare(a.version || ''))[0]?.version || '—'
    : '—';
  const platforms = [...new Set(whatsNewEntries.map(e => e.platform || 'all'))].join(', ') || '—';
  
  $('wnsum-total').textContent = total;
  $('wnsum-active').textContent = active;
  $('wnsum-latest').textContent = latest;
  $('wnsum-platforms').textContent = platforms;
}

window.editWhatsNewEntry = function(idx) {
  const entry = whatsNewEntries[idx];
  if (!entry) return;
  $('wn-version').value = entry.version || '';
  $('wn-platform').value = entry.platform || 'all';
  $('wn-order').value = entry.order ?? 0;
  $('wn-active').checked = entry.active !== false;
  $('wn-title').value = entry.title || '';
  $('wn-description').value = entry.description || '';
  const imageUrl = entry.image?.url || entry.image?.formats?.thumbnail?.url || entry.image?.formats?.small?.url;
  $('wn-image-url').value = imageUrl || '';
  banner('Editing entry. Modify and click "Add Entry" to update.', 'info');
};

window.toggleWhatsNewActive = async function(idx) {
  const entry = whatsNewEntries[idx];
  if (!entry) return;
  try {
    const updated = { ...entry, active: entry.active === false };
    await api(withEnv('/api/whatsnew/' + encodeURIComponent(entry.documentId || entry.id)), {
      method: 'PUT',
      body: JSON.stringify({ data: updated })
    });
    banner(`Entry ${updated.active ? 'activated' : 'deactivated'}.`, 'success');
    await loadWhatsNewEntries();
  } catch (err) {
    banner(`Failed: ${err.message}`, 'error');
  }
};

window.deleteWhatsNewEntry = async function(idx) {
  const entry = whatsNewEntries[idx];
  if (!entry) return;
  if (!confirm(`Delete version "${entry.version}"? This cannot be undone.`)) return;
  try {
    await api(withEnv('/api/whatsnew/' + encodeURIComponent(entry.documentId || entry.id)), { method: 'DELETE' });
    banner('Entry deleted.', 'success');
    await loadWhatsNewEntries();
  } catch (err) {
    banner(`Delete failed: ${err.message}`, 'error');
  }
};

async function addWhatsNewEntry(applyToAll = false) {
  const version = $('wn-version').value.trim();
  const platform = $('wn-platform').value;
  const order = parseInt($('wn-order').value, 10) || 0;
  const active = $('wn-active').checked;
  const title = $('wn-title').value.trim();
  const description = $('wn-description').value.trim();
  const imageUrl = $('wn-image-url').value.trim();
  const errEl = $('wn-form-error');
  
  errEl.classList.add('hidden');
  
  if (!version) {
    errEl.textContent = 'Version is required';
    errEl.classList.remove('hidden');
    return;
  }
  
  const payload = {
    data: {
      version,
      platform,
      order,
      active,
      title,
      description
    }
  };
  
  try {
    // Upload media files first (if any)
    let uploadedMediaIds = [];
    if (pendingMediaFiles.length > 0) {
      for (const file of pendingMediaFiles) {
        const formData = new FormData();
        formData.append('files', file);
        
        const response = await fetch(withEnv('/api/upload'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          const fileId = Array.isArray(result) ? result[0]?.id : result?.id;
          if (fileId) uploadedMediaIds.push(fileId);
        }
      }
      
      if (uploadedMediaIds.length > 0) {
        payload.data.media = uploadedMediaIds;
      }
    }
    
    // Handle legacy image URL if provided and no files uploaded
    if (imageUrl && uploadedMediaIds.length === 0) {
      try {
        const fileId = await api(withEnv('/api/upload-from-url'), {
          method: 'POST',
          body: JSON.stringify({ imageUrl, filename: 'whats-new.jpg' })
        });
        payload.data.image = fileId.id || fileId;
      } catch (e) {
        // If upload fails, continue without image
      }
    }
    
    if (applyToAll) {
      const envs = await api('/api/environments');
      const results = [];
      for (const env of envs.environments) {
        await api('/api/whatsnew?env=' + encodeURIComponent(env.id), { method: 'POST', body: JSON.stringify(payload) });
        results.push(env.name);
      }
      banner(`✓ Added to all environments: ${results.join(', ')}`, 'success');
    } else {
      await api(withEnv('/api/whatsnew'), { method: 'POST', body: JSON.stringify(payload) });
      banner('✓ Entry added.', 'success');
    }
    
    // Clear form
    $('wn-version').value = '';
    $('wn-title').value = '';
    $('wn-description').value = '';
    $('wn-image-url').value = '';
    $('wn-order').value = '0';
    pendingMediaFiles = [];
    renderMediaPreview();
    
    await loadWhatsNewEntries();
    loadLogs();
  } catch (err) {
    errEl.textContent = `Failed: ${err.message}`;
    errEl.classList.remove('hidden');
  }
}

async function syncWhatsNewAcrossEnvs() {
  if (!confirm('This will copy ALL entries from the current environment to ALL other environments. Continue?')) return;
  
  try {
    const envs = await api('/api/environments');
    const sourceEntries = whatsNewEntries;
    
    if (!sourceEntries.length) {
      banner('No entries to sync.', 'error');
      return;
    }
    
    let count = 0;
    for (const targetEnv of envs.environments) {
      if (targetEnv.id === currentEnv) continue;
      
      for (const entry of sourceEntries) {
        const payload = {
          data: {
            version: entry.version,
            platform: entry.platform,
            order: entry.order ?? 0,
            active: entry.active,
            title: entry.title,
            description: entry.description
          }
        };
        try {
          await api('/api/whatsnew?env=' + encodeURIComponent(targetEnv.id), {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          count++;
        } catch (e) { /* skip duplicates */ }
      }
    }
    
    banner(`✓ Synced ${count} entries to other environments.`, 'success');
    loadLogs();
  } catch (err) {
    banner(`Sync failed: ${err.message}`, 'error');
  }
}

function exportWhatsNewJson() {
  const json = JSON.stringify(whatsNewEntries, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whats-new-${currentEnv}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  banner('Exported JSON file.', 'success');
}

function importWhatsNewJson() {
  const text = $('wn-import-data').value.trim();
  const errEl = $('wn-import-error');
  errEl.classList.add('hidden');
  
  if (!text) {
    errEl.textContent = 'Paste JSON data first';
    errEl.classList.remove('hidden');
    return;
  }
  
  let entries;
  try {
    entries = JSON.parse(text);
    if (!Array.isArray(entries)) throw new Error('JSON must be an array');
  } catch (e) {
    errEl.textContent = `Invalid JSON: ${e.message}`;
    errEl.classList.remove('hidden');
    return;
  }
  
  for (const entry of entries) {
    if (!entry.version) throw new Error('Each entry must have a version');
  }
  
  banner(`Importing ${entries.length} entries...`, 'info');
  $('wn-import-area').classList.add('hidden');
  banner('Import feature coming soon. Use sync instead.', 'info');
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
      chip.innerHTML = `<span class="chip-text"></span><button type="button" class="chip-del" title="Remove">×</button>`;
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
    rawToggle.textContent = showRaw ? '⇄ List mode' : '⇄ Paste mode';
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
  try {
    await api('/api/config', { method: 'PUT', body: JSON.stringify({ env: currentEnv, ...formState() }) });
    savedSnapshot = JSON.stringify(formState());
    refreshUi();
    banner('✓ Saved to disk — settings will persist across restarts.', 'success');
    loadLogs();
  } catch (err) {
    banner(`Save failed: ${err.message}`, 'error');
  }
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
      `<span class="env-item-check">${e.id === currentEnv ? '✓' : ''}</span>` +
      `<span class="env-item-name"></span>` +
      (canDelete ? `<button type="button" class="env-item-del" title="Remove environment">×</button>` : '');
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
  renderEnvMenu();
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
  if (e.location?.name) bits.push(`📍 ${e.location.name}`);
  if (e.dojoId != null) bits.push(`dojo #${e.dojoId}`);
  if (e.hasPhoto) bits.push('📷 photo');
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
    $('wn-add-btn').addEventListener('click', () => addWhatsNewEntry(false));
    $('wn-apply-all').addEventListener('click', () => addWhatsNewEntry(true));
    $('wn-clear-btn').addEventListener('click', () => {
      $('wn-version').value = '';
      $('wn-title').value = '';
      $('wn-description').value = '';
      $('wn-image-url').value = '';
      $('wn-order').value = '0';
      $('wn-platform').value = 'all';
      $('wn-active').checked = true;
      $('wn-form-error').classList.add('hidden');
    });
    $('wn-search').addEventListener('input', renderWhatsNewList);
    $('wn-filter-active').addEventListener('change', renderWhatsNewList);
    $('wn-refresh').addEventListener('click', loadWhatsNewEntries);
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

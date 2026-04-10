const STORAGE = {
  users: 'summerScheduler.users',
  session: 'summerScheduler.session',
  calendars: 'summerScheduler.calendars'
};

const ROLE_COLORS = { Father: '#3c77d0', Mother: '#d17aa4', Attorney: '#3f454d' };
const HOLIDAYS = {
  'memorial-day': { month: 4, nth: -1, weekday: 1 },
  'independence-day': { fixed: [6, 4] },
  'labor-day': { month: 8, nth: 1, weekday: 1 }
};

const state = { user: null, currentCalendarId: null, currentData: null, customAssignments: {} };
const $ = (id) => document.getElementById(id);

const entryView = $('entryView');
const authView = $('authView');
const plannerView = $('plannerView');
const loginForm = $('loginForm');
const signupForm = $('signupForm');
const plannerForm = $('plannerForm');
const authMessage = $('authMessage');
const savedCalendarList = $('savedCalendarList');
const holidayDropdown = $('holidayDropdown');
const holidayToggle = $('holidayToggle');
const calendarOutput = $('calendarOutput');
const totals = $('overnightTotals');

function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function allUsers() { return loadJSON(STORAGE.users, []); }
function allCalendars() { return loadJSON(STORAGE.calendars, {}); }

function showView(which) {
  entryView.classList.add('hidden');
  authView.classList.add('hidden');
  plannerView.classList.add('hidden');
  if (which === 'entry') entryView.classList.remove('hidden');
  if (which === 'auth') authView.classList.remove('hidden');
  if (which === 'planner') plannerView.classList.remove('hidden');
  $('logoutBtn').classList.toggle('hidden', which !== 'planner');
}

function showAuthMode(mode) {
  loginForm.classList.toggle('hidden', mode !== 'login');
  signupForm.classList.toggle('hidden', mode !== 'signup');
  authMessage.textContent = '';
  showView('auth');
}

function generateAccountNumber() {
  return `ACCT-${Math.floor(100000 + Math.random() * 900000)}`;
}

function createAccount(fd) {
  const users = allUsers();
  const accountNumber = generateAccountNumber();
  const user = {
    id: crypto.randomUUID(),
    accountNumber,
    name: fd.get('name').trim(),
    role: fd.get('role'),
    custody: fd.get('custody'),
    state: 'Indiana',
    password: fd.get('password')
  };
  users.push(user);
  saveJSON(STORAGE.users, users);
  return user;
}

function login(accountNumber, password) {
  const user = allUsers().find((u) => u.accountNumber === accountNumber.trim() && u.password === password);
  if (!user) throw new Error('Invalid account number or password.');
  state.user = user;
  saveJSON(STORAGE.session, { userId: user.id });
}

function restoreSession() {
  const session = loadJSON(STORAGE.session, null);
  if (!session) return;
  const user = allUsers().find((u) => u.id === session.userId);
  if (user) state.user = user;
}

function logout() {
  localStorage.removeItem(STORAGE.session);
  state.user = null;
  state.currentCalendarId = null;
  state.currentData = null;
  state.customAssignments = {};
  calendarOutput.innerHTML = '';
  totals.textContent = 'Overnights will appear after generation.';
  showView('entry');
}

function defaultPlannerData() {
  const primary = state.user.name;
  const otherRole = state.user.role === 'Mother' ? 'Father' : 'Mother';
  return {
    title: `${primary} Summer Plan`,
    schoolEnd: '',
    schoolStart: '',
    split: 'alternating-weekends',
    parent1: primary,
    parent2: otherRole,
    color1: ROLE_COLORS[state.user.role] || '#3f454d',
    color2: ROLE_COLORS[otherRole] || '#777777',
    holidayOwner: 'parent1',
    holidays: [],
    customAssignments: {}
  };
}

function fillPlanner(data) {
  Object.keys(data).forEach((k) => {
    if (plannerForm[k] && k !== 'holidays' && k !== 'customAssignments') plannerForm[k].value = data[k];
  });
  holidayDropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = (data.holidays || []).includes(cb.value);
  });
  state.customAssignments = data.customAssignments || {};
}

function collectPlannerData() {
  const fd = new FormData(plannerForm);
  return {
    title: fd.get('title').trim(),
    schoolEnd: fd.get('schoolEnd'),
    schoolStart: fd.get('schoolStart'),
    split: fd.get('split'),
    parent1: fd.get('parent1').trim(),
    parent2: fd.get('parent2').trim(),
    color1: fd.get('color1'),
    color2: fd.get('color2'),
    holidayOwner: fd.get('holidayOwner'),
    holidays: [...holidayDropdown.querySelectorAll('input:checked')].map((cb) => cb.value),
    customAssignments: state.customAssignments
  };
}

function currentUserCalendars() {
  return allCalendars()[state.user.id] || [];
}

function saveCurrentCalendar({ overwrite = false } = {}) {
  const payload = collectPlannerData();
  const byUser = allCalendars();
  const list = byUser[state.user.id] || [];
  if (overwrite && state.currentCalendarId) {
    const idx = list.findIndex((c) => c.id === state.currentCalendarId);
    if (idx >= 0) list[idx] = { ...payload, id: state.currentCalendarId, updatedAt: new Date().toISOString() };
  } else {
    state.currentCalendarId = crypto.randomUUID();
    list.unshift({ ...payload, id: state.currentCalendarId, createdAt: new Date().toISOString() });
  }
  byUser[state.user.id] = list;
  saveJSON(STORAGE.calendars, byUser);
  renderSavedCalendars();
}

function renderSavedCalendars() {
  const list = currentUserCalendars();
  savedCalendarList.innerHTML = '';
  if (!list.length) {
    savedCalendarList.innerHTML = '<li class="saved-item">No saved calendars yet.</li>';
    return;
  }
  list.forEach((cal) => {
    const li = document.createElement('li');
    li.className = 'saved-item';
    li.innerHTML = `<strong>${cal.title}</strong><br><small>${new Date(cal.updatedAt || cal.createdAt).toLocaleString()}</small><br>
      <button data-action="open" data-id="${cal.id}" type="button">Open</button>
      <button data-action="overwrite" data-id="${cal.id}" type="button" class="secondary">Overwrite</button>`;
    savedCalendarList.appendChild(li);
  });
}

function holidayDate(year, rule) {
  if (rule.fixed) return new Date(year, rule.fixed[0], rule.fixed[1]);
  if (rule.nth > 0) {
    const first = new Date(year, rule.month, 1);
    const offset = (7 + rule.weekday - first.getDay()) % 7;
    return new Date(year, rule.month, 1 + offset + (rule.nth - 1) * 7);
  }
  const last = new Date(year, rule.month + 1, 0);
  const offset = (7 + last.getDay() - rule.weekday) % 7;
  return new Date(year, rule.month, last.getDate() - offset);
}

function holidayMap(startYear, endYear, selected) {
  const dates = new Set();
  for (let y = startYear; y <= endYear; y += 1) {
    selected.forEach((h) => dates.add(holidayDate(y, HOLIDAYS[h]).toISOString().slice(0, 10)));
  }
  return dates;
}

function dateRange(start, end) {
  const rows = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    rows.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function assignmentForDay(data, d, index) {
  const iso = d.toISOString().slice(0, 10);
  if (data.split === 'custom' && data.customAssignments[iso]) return data.customAssignments[iso];
  if (data.split === 'alternating-weekends') {
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (isWeekend && Math.floor(index / 7) % 2 === 1) return data.parent2;
    return data.parent1;
  }
  if (data.split === 'every-other-week') return Math.floor(index / 7) % 2 === 0 ? data.parent1 : data.parent2;
  if (data.split === '2-2-3') {
    const cycle = [data.parent1, data.parent1, data.parent2, data.parent2, data.parent1, data.parent2, data.parent2];
    return cycle[index % 7];
  }
  return data.parent1;
}

function generateRows(data) {
  const start = new Date(data.schoolEnd);
  const end = new Date(data.schoolStart);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start) throw new Error('Enter valid school dates.');

  const holidayDates = holidayMap(start.getFullYear(), end.getFullYear(), data.holidays);
  const holidayOwner = data.holidayOwner === 'parent1' ? data.parent1 : data.parent2;

  return dateRange(start, end).map((d, i) => {
    const iso = d.toISOString().slice(0, 10);
    let owner = assignmentForDay(data, d, i);
    if (holidayDates.has(iso)) owner = holidayOwner;
    return {
      iso,
      dateLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      day: d.getDate(),
      month: d.getMonth(),
      year: d.getFullYear(),
      owner,
      color: owner === data.parent1 ? data.color1 : data.color2
    };
  });
}

function renderTotals(rows, data) {
  const p1 = rows.filter((r) => r.owner === data.parent1).length;
  const p2 = rows.filter((r) => r.owner === data.parent2).length;
  totals.textContent = `${data.parent1}: ${p1} overnights • ${data.parent2}: ${p2} overnights`;
}

function renderList(rows) {
  calendarOutput.innerHTML = rows
    .map((r) => `<div class="day-row"><div class="day-date">${r.dateLabel}</div><div class="day-owner" style="background:${r.color}">${r.owner}</div></div>`)
    .join('');
}

function renderCustomMonthGrid(rows, data) {
  const grouped = {};
  rows.forEach((r) => {
    const key = `${r.year}-${r.month}`;
    grouped[key] ||= [];
    grouped[key].push(r);
  });

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  calendarOutput.innerHTML = '';

  Object.keys(grouped).sort().forEach((key) => {
    const [year, month] = key.split('-').map(Number);
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const rowsByDay = Object.fromEntries(grouped[key].map((r) => [r.day, r]));

    const wrap = document.createElement('div');
    wrap.className = 'month-grid';
    wrap.innerHTML = `<h4>${new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h4>
      <div class="weekdays">${weekdays.map((w) => `<div>${w}</div>`).join('')}</div><div class="days"></div>`;

    const daysEl = wrap.querySelector('.days');
    for (let i = 0; i < firstDow; i += 1) {
      const blank = document.createElement('div');
      blank.className = 'day-cell empty';
      daysEl.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d += 1) {
      const info = rowsByDay[d];
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `day-cell${info ? '' : ' empty'}`;
      if (info) {
        cell.dataset.iso = info.iso;
        cell.style.background = info.color;
        cell.style.color = '#fff';
        cell.innerHTML = `<span class="n">${d}</span>${info.owner}`;
      } else {
        cell.disabled = true;
        cell.innerHTML = `<span class="n">${d}</span>`;
      }
      daysEl.appendChild(cell);
    }
    calendarOutput.appendChild(wrap);
  });

  calendarOutput.querySelectorAll('.day-cell[data-iso]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const iso = cell.dataset.iso;
      const current = state.customAssignments[iso] || data.parent1;
      state.customAssignments[iso] = current === data.parent1 ? data.parent2 : data.parent1;
      generateAndRender();
    });
  });
}

function generateAndRender() {
  const data = collectPlannerData();
  const rows = generateRows(data);
  state.currentData = data;
  if (data.split === 'custom') renderCustomMonthGrid(rows, data);
  else renderList(rows);
  renderTotals(rows, data);
}

function openCalendar(id) {
  const cal = currentUserCalendars().find((c) => c.id === id);
  if (!cal) return;
  state.currentCalendarId = id;
  fillPlanner(cal);
  $('plannerTitle').textContent = `Planner • ${cal.title}`;
  generateAndRender();
}

function newCalendar() {
  state.currentCalendarId = null;
  const defaults = defaultPlannerData();
  fillPlanner(defaults);
  $('plannerTitle').textContent = 'Planner';
  calendarOutput.innerHTML = '';
  totals.textContent = 'Overnights will appear after generation.';
}

function showPlanner() {
  showView('planner');
  renderSavedCalendars();
  newCalendar();
}

function downloadCalendar() {
  const payload = { user: state.user.accountNumber, calendar: collectPlannerData() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${payload.calendar.title.replace(/\s+/g, '_').toLowerCase() || 'summer_calendar'}.json`;
  a.click();
}

function emailCalendar() {
  const data = collectPlannerData();
  const body = encodeURIComponent(`Summer schedule: ${data.title}\nParent 1: ${data.parent1}\nParent 2: ${data.parent2}`);
  window.location.href = `mailto:?subject=${encodeURIComponent(data.title)}&body=${body}`;
}

function shareLink() {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(collectPlannerData()))));
  const url = `${location.origin}${location.pathname}#share=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    totals.textContent = 'Share link copied to clipboard.';
  });
}

function loadShared() {
  if (!location.hash.startsWith('#share=')) return false;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7)))));
    fillPlanner(payload);
    generateAndRender();
    showView('planner');
    return true;
  } catch {
    return false;
  }
}

$('startLogin').addEventListener('click', () => showAuthMode('login'));
$('startSignup').addEventListener('click', () => showAuthMode('signup'));
$('backToStart').addEventListener('click', () => showView('entry'));
$('logoutBtn').addEventListener('click', logout);
$('newCalendarBtn').addEventListener('click', newCalendar);
$('saveBtn').addEventListener('click', () => saveCurrentCalendar({ overwrite: Boolean(state.currentCalendarId) }));
$('downloadBtn').addEventListener('click', downloadCalendar);
$('printBtn').addEventListener('click', () => window.print());
$('emailBtn').addEventListener('click', emailCalendar);
$('shareBtn').addEventListener('click', shareLink);

plannerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try { generateAndRender(); } catch (err) { calendarOutput.innerHTML = `<p class="message">${err.message}</p>`; }
});

savedCalendarList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'open') openCalendar(id);
  if (action === 'overwrite') {
    state.currentCalendarId = id;
    saveCurrentCalendar({ overwrite: true });
  }
});

holidayToggle.addEventListener('click', () => holidayDropdown.classList.toggle('hidden'));
document.addEventListener('click', (e) => {
  if (!holidayDropdown.contains(e.target) && e.target !== holidayToggle) holidayDropdown.classList.add('hidden');
});

signupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const user = createAccount(new FormData(signupForm));
  authMessage.style.color = '#0d5f2f';
  authMessage.textContent = `Account created. Your account number: ${user.accountNumber}. Use this to log in.`;
  signupForm.reset();
  showAuthMode('login');
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    login(loginForm.accountNumber.value, loginForm.password.value);
    showPlanner();
  } catch (err) {
    authMessage.style.color = '#8f2f2f';
    authMessage.textContent = err.message;
  }
});

restoreSession();
if (!loadShared()) {
  if (state.user) showPlanner();
  else showView('entry');
}

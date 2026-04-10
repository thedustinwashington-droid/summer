const STORAGE = {
  users: 'summerScheduler.users',
  session: 'summerScheduler.session',
  calendars: 'summerScheduler.calendars'
};

const ROLE_COLORS = {
  Father: '#3c77d0',
  Mother: '#d17aa4',
  Attorney: '#3f454d'
};

const HOLIDAYS = {
  'memorial-day': { month: 4, nth: -1, weekday: 1 },
  'independence-day': { fixed: [6, 4] },
  'labor-day': { month: 8, nth: 1, weekday: 1 }
};

const state = {
  user: null,
  currentCalendarId: null,
  currentData: null
};

const $ = (id) => document.getElementById(id);

const authView = $('authView');
const plannerView = $('plannerView');
const logoutBtn = $('logoutBtn');
const authMessage = $('authMessage');
const signupForm = $('signupForm');
const loginForm = $('loginForm');
const plannerForm = $('plannerForm');
const calendarOutput = $('calendarOutput');
const savedCalendarList = $('savedCalendarList');
const holidayToggle = $('holidayToggle');
const holidayDropdown = $('holidayDropdown');
const plannerTitle = $('plannerTitle');

function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function allUsers() {
  return loadJSON(STORAGE.users, []);
}

function allCalendars() {
  return loadJSON(STORAGE.calendars, {});
}

function setAuthMode(mode) {
  const showLogin = $('showLogin');
  const showSignup = $('showSignup');
  if (mode === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    showLogin.classList.add('active');
    showSignup.classList.remove('active');
  } else {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    showSignup.classList.add('active');
    showLogin.classList.remove('active');
  }
  authMessage.textContent = '';
}

function createAccount(formData) {
  const users = allUsers();
  const name = formData.get('name').trim();
  if (users.find((u) => u.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('That name already exists. Log in instead.');
  }
  const user = {
    id: crypto.randomUUID(),
    name,
    role: formData.get('role'),
    custody: formData.get('custody'),
    state: 'Indiana',
    password: formData.get('password')
  };
  users.push(user);
  saveJSON(STORAGE.users, users);
  return user;
}

function login(name, password) {
  const user = allUsers().find(
    (u) => u.name.toLowerCase() === name.trim().toLowerCase() && u.password === password
  );
  if (!user) throw new Error('Invalid credentials.');
  saveJSON(STORAGE.session, { userId: user.id });
  state.user = user;
}

function restoreSession() {
  const session = loadJSON(STORAGE.session, null);
  if (!session) return;
  const user = allUsers().find((u) => u.id === session.userId);
  if (!user) return;
  state.user = user;
}

function logout() {
  localStorage.removeItem(STORAGE.session);
  state.user = null;
  state.currentCalendarId = null;
  state.currentData = null;
  calendarOutput.innerHTML = '';
  loginForm.reset();
  showAuth();
}

function currentUserCalendars() {
  const byUser = allCalendars();
  return byUser[state.user.id] || [];
}

function saveCurrentCalendar({ overwrite = false } = {}) {
  if (!state.user) return;
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

function defaultPlannerData() {
  const primaryName = state.user.name;
  const other = state.user.role === 'Mother' ? 'Father' : 'Mother';
  return {
    title: `${primaryName} Summer Plan`,
    schoolEnd: '',
    schoolStart: '',
    split: 'alternating-weeks',
    parent1: primaryName,
    parent2: other,
    color1: ROLE_COLORS[state.user.role] || '#3f454d',
    color2: ROLE_COLORS[other] || '#888888',
    holidayOwner: 'parent1',
    holidays: []
  };
}

function fillPlanner(data) {
  plannerForm.title.value = data.title;
  plannerForm.schoolEnd.value = data.schoolEnd;
  plannerForm.schoolStart.value = data.schoolStart;
  plannerForm.split.value = data.split;
  plannerForm.parent1.value = data.parent1;
  plannerForm.parent2.value = data.parent2;
  plannerForm.color1.value = data.color1;
  plannerForm.color2.value = data.color2;
  plannerForm.holidayOwner.value = data.holidayOwner;
  holidayDropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = data.holidays.includes(cb.value);
  });
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
    holidays: [...holidayDropdown.querySelectorAll('input:checked')].map((cb) => cb.value)
  };
}

function renderSavedCalendars() {
  const calendars = currentUserCalendars();
  savedCalendarList.innerHTML = '';
  if (!calendars.length) {
    savedCalendarList.innerHTML = '<li class="saved-item">No saved calendars yet.</li>';
    return;
  }
  calendars.forEach((cal) => {
    const li = document.createElement('li');
    li.className = 'saved-item';
    li.innerHTML = `
      <strong>${cal.title}</strong><br />
      <small>Updated: ${new Date(cal.updatedAt || cal.createdAt).toLocaleString()}</small><br />
      <button type="button" data-action="open" data-id="${cal.id}">Open</button>
      <button type="button" data-action="overwrite" data-id="${cal.id}" class="secondary">Overwrite</button>
    `;
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
  const map = new Set();
  for (let y = startYear; y <= endYear; y += 1) {
    selected.forEach((key) => {
      const d = holidayDate(y, HOLIDAYS[key]);
      map.add(d.toISOString().slice(0, 10));
    });
  }
  return map;
}

function generateSchedule(data) {
  const start = new Date(data.schoolEnd);
  const end = new Date(data.schoolStart);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start) {
    throw new Error('Enter valid school dates.');
  }

  const holidays = holidayMap(start.getFullYear(), end.getFullYear(), data.holidays);
  const holidayOwner = data.holidayOwner === 'parent1' ? data.parent1 : data.parent2;
  const rows = [];

  let cursor = new Date(start);
  let dayIndex = 0;
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    let owner;
    if (data.split === 'weekend-rotation') {
      const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
      owner = weekend && Math.floor(dayIndex / 7) % 2 === 1 ? data.parent2 : data.parent1;
    } else {
      owner = Math.floor(dayIndex / 7) % 2 === 0 ? data.parent1 : data.parent2;
    }
    if (holidays.has(iso)) owner = holidayOwner;

    rows.push({
      dateLabel: cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      owner,
      color: owner === data.parent1 ? data.color1 : data.color2
    });
    cursor.setDate(cursor.getDate() + 1);
    dayIndex += 1;
  }
  return rows;
}

function renderCalendar(rows) {
  calendarOutput.innerHTML = rows
    .map(
      (r) => `<div class="day-row"><div class="day-date">${r.dateLabel}</div><div class="day-owner" style="background:${r.color}">${r.owner}</div></div>`
    )
    .join('');
}

function openCalendar(id) {
  const cal = currentUserCalendars().find((c) => c.id === id);
  if (!cal) return;
  state.currentCalendarId = id;
  state.currentData = cal;
  plannerTitle.textContent = `Planner • ${cal.title}`;
  fillPlanner(cal);
  renderCalendar(generateSchedule(cal));
}

function newCalendar() {
  state.currentCalendarId = null;
  state.currentData = defaultPlannerData();
  plannerTitle.textContent = 'Planner';
  fillPlanner(state.currentData);
  calendarOutput.innerHTML = '';
}

function showPlanner() {
  authView.classList.add('hidden');
  plannerView.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  renderSavedCalendars();
  newCalendar();
}

function showAuth() {
  authView.classList.remove('hidden');
  plannerView.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  setAuthMode('login');
}

$('showLogin').addEventListener('click', () => setAuthMode('login'));
$('showSignup').addEventListener('click', () => setAuthMode('signup'));

signupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const user = createAccount(new FormData(signupForm));
    login(user.name, user.password);
    signupForm.reset();
    showPlanner();
  } catch (err) {
    authMessage.textContent = err.message;
  }
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    login(loginForm.name.value, loginForm.password.value);
    showPlanner();
  } catch (err) {
    authMessage.textContent = err.message;
  }
});

plannerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const data = collectPlannerData();
    renderCalendar(generateSchedule(data));
    state.currentData = data;
  } catch (err) {
    calendarOutput.innerHTML = `<p class="message">${err.message}</p>`;
  }
});

$('saveBtn').addEventListener('click', () => {
  saveCurrentCalendar({ overwrite: Boolean(state.currentCalendarId) });
});

$('newCalendarBtn').addEventListener('click', newCalendar);

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

holidayToggle.addEventListener('click', () => {
  holidayDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!holidayDropdown.contains(e.target) && e.target !== holidayToggle) {
    holidayDropdown.classList.add('hidden');
  }
});

logoutBtn.addEventListener('click', logout);

restoreSession();
if (state.user) {
  showPlanner();
} else {
  showAuth();
}

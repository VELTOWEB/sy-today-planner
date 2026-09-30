(function () {
  'use strict';

  const STORAGE_KEY = 'todayPlannerData';
  const BACKUP_KEY = 'todayPlannerDataBackupV1';
  const SCHEMA_VERSION = 4;
  const MOODS = ['good', 'normal', 'sad'];
  const DEFAULT_PROFILE = {
    name: '여서윤',
    age: 18,
    gender: 'female',
    status: '오늘도 하나씩 해내는 중.',
    photo: ''
  };

  function createId(prefix = 'item') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function isDateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
  function clampString(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

  function sanitizeTask(task, index) {
    if (!task || typeof task !== 'object') return null;
    const text = clampString(task.text, 160);
    if (!text) return null;
    return {
      id: typeof task.id === 'string' && task.id ? task.id : createId('task'),
      text,
      completed: Boolean(task.completed),
      important: Boolean(task.important),
      core: Boolean(task.core),
      order: Number.isFinite(task.order) ? Number(task.order) : index,
      createdAt: Number.isFinite(task.createdAt) ? Number(task.createdAt) : Date.now(),
      completedAt: Number.isFinite(task.completedAt) ? Number(task.completedAt) : null
    };
  }

  function sanitizeNote(note) {
    if (!note || typeof note !== 'object') return null;
    const text = clampString(note.text, 240);
    if (!text) return null;
    return {
      id: typeof note.id === 'string' && note.id ? note.id : createId('note'),
      text,
      createdAt: Number.isFinite(note.createdAt) ? Number(note.createdAt) : Date.now(),
      updatedAt: Number.isFinite(note.updatedAt) ? Number(note.updatedAt) : null
    };
  }

  function sanitizeFocusSession(session) {
    if (!session || typeof session !== 'object') return null;
    const durationSec = Number.isFinite(session.durationSec) ? Math.max(60, Math.round(session.durationSec)) : 1500;
    const completedAt = Number.isFinite(session.completedAt) ? Number(session.completedAt) : Date.now();
    return {
      id: typeof session.id === 'string' && session.id ? session.id : createId('focus'),
      taskId: typeof session.taskId === 'string' ? session.taskId : '',
      taskText: clampString(session.taskText, 160),
      durationSec,
      completedAt
    };
  }

  function sanitizeDay(day) {
    const safe = day && typeof day === 'object' ? day : {};
    const tasks = Array.isArray(safe.tasks) ? safe.tasks.map(sanitizeTask).filter(Boolean).sort((a,b) => a.order - b.order) : [];
    tasks.forEach((task, index) => { task.order = index; });

    let notes = Array.isArray(safe.notes) ? safe.notes.map(sanitizeNote).filter(Boolean) : [];
    if (!notes.length && typeof safe.memo === 'string' && safe.memo.trim()) {
      const legacyMemo = safe.memo.trim();
      const chunks = [];
      for (let index = 0; index < legacyMemo.length; index += 240) chunks.push(legacyMemo.slice(index, index + 240));
      notes = chunks.map((text, index) => ({ id: createId(`note-legacy-${index}`), text, createdAt: Date.now() + index, updatedAt: null }));
    }

    const routineChecks = {};
    if (safe.routineChecks && typeof safe.routineChecks === 'object') {
      Object.entries(safe.routineChecks).forEach(([key, value]) => { if (typeof key === 'string' && key) routineChecks[key] = Boolean(value); });
    }

    return {
      tasks,
      notes,
      mood: MOODS.includes(safe.mood) ? safe.mood : '',
      journal: typeof safe.journal === 'string' ? safe.journal.slice(0, 180) : '',
      routineChecks,
      focusSessions: Array.isArray(safe.focusSessions) ? safe.focusSessions.map(sanitizeFocusSession).filter(Boolean) : []
    };
  }

  function sanitizeRoutine(routine) {
    if (!routine || typeof routine !== 'object') return null;
    const name = clampString(routine.name, 80);
    if (!name) return null;
    const days = Array.isArray(routine.days) ? [...new Set(routine.days.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a,b)=>a-b) : [0,1,2,3,4,5,6];
    return {
      id: typeof routine.id === 'string' && routine.id ? routine.id : createId('routine'),
      name,
      days: days.length ? days : [0,1,2,3,4,5,6],
      createdAt: Number.isFinite(routine.createdAt) ? Number(routine.createdAt) : Date.now()
    };
  }

  function sanitizeProfile(profile) {
    const safe = profile && typeof profile === 'object' ? profile : {};
    const photo = typeof safe.photo === 'string' && /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(safe.photo) && safe.photo.length <= 650000
      ? safe.photo
      : '';
    return {
      name: clampString(safe.name, 30) || DEFAULT_PROFILE.name,
      age: Number.isFinite(Number(safe.age)) ? Math.max(1, Math.min(120, Math.round(Number(safe.age)))) : DEFAULT_PROFILE.age,
      gender: ['male','female','other'].includes(safe.gender) ? safe.gender : DEFAULT_PROFILE.gender,
      status: clampString(safe.status, 80) || DEFAULT_PROFILE.status,
      photo
    };
  }

  function sanitizeSettings(settings) {
    const safe = settings && typeof settings === 'object' ? settings : {};
    return { theme: ['system','light','dark'].includes(safe.theme) ? safe.theme : 'system' };
  }

  function sanitizeTimer(timer) {
    const safe = timer && typeof timer === 'object' ? timer : {};
    const durationSec = [900,1500,1800,2700,3600].includes(Number(safe.durationSec)) ? Number(safe.durationSec) : 1500;
    const remainingSec = Number.isFinite(Number(safe.remainingSec)) ? Math.max(0, Math.min(durationSec, Math.round(Number(safe.remainingSec)))) : durationSec;
    return {
      durationSec,
      remainingSec,
      running: Boolean(safe.running),
      endAt: Number.isFinite(safe.endAt) ? Number(safe.endAt) : null,
      taskRef: safe.taskRef && typeof safe.taskRef === 'object' && isDateKey(safe.taskRef.dateKey) && typeof safe.taskRef.taskId === 'string'
        ? { dateKey: safe.taskRef.dateKey, taskId: safe.taskRef.taskId }
        : null
    };
  }

  function createDefaultState() {
    return {
      version: SCHEMA_VERSION,
      days: {},
      routines: [],
      profile: { ...DEFAULT_PROFILE },
      settings: { theme: 'system' },
      timer: sanitizeTimer({})
    };
  }

  function migrateRawState(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const version = Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1;
    if (version < 4) {
      raw = {
        ...raw,
        profile: {
          ...(raw.profile && typeof raw.profile === 'object' ? raw.profile : {}),
          name: DEFAULT_PROFILE.name,
          age: DEFAULT_PROFILE.age,
          gender: DEFAULT_PROFILE.gender
        }
      };
    }
    return raw;
  }

  function sanitizeState(raw) {
    const base = createDefaultState();
    if (!raw || typeof raw !== 'object') return base;
    const days = {};
    if (raw.days && typeof raw.days === 'object') {
      Object.entries(raw.days).forEach(([dateKey, value]) => { if (isDateKey(dateKey)) days[dateKey] = sanitizeDay(value); });
    }
    return {
      version: SCHEMA_VERSION,
      days,
      routines: Array.isArray(raw.routines) ? raw.routines.map(sanitizeRoutine).filter(Boolean) : [],
      profile: sanitizeProfile(raw.profile),
      settings: sanitizeSettings(raw.settings),
      timer: sanitizeTimer(raw.timer)
    };
  }

  function loadState() {
    try {
      const rawText = localStorage.getItem(STORAGE_KEY);
      if (!rawText) return createDefaultState();
      const raw = migrateRawState(JSON.parse(rawText));
      if (!localStorage.getItem(BACKUP_KEY)) {
        try { localStorage.setItem(BACKUP_KEY, rawText); } catch (_) { /* best effort */ }
      }
      return sanitizeState(raw);
    } catch (error) {
      console.warn('저장 데이터를 읽지 못해 기본 상태로 시작합니다.', error);
      return createDefaultState();
    }
  }

  let state = loadState();

  function persist() {
    try {
      state.version = SCHEMA_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error('저장에 실패했습니다.', error);
      return false;
    }
  }

  persist();

  function ensureDay(dateKey) {
    if (!isDateKey(dateKey)) throw new Error('잘못된 날짜 키입니다.');
    if (!state.days[dateKey]) state.days[dateKey] = sanitizeDay({});
    return state.days[dateKey];
  }

  function getDay(dateKey) { return sanitizeDay(state.days[dateKey]); }
  function getAllDays() { return state.days; }
  function getRoutines() { return state.routines.map(item => ({ ...item, days: [...item.days] })); }
  function getProfile() { return { ...state.profile }; }
  function getSettings() { return { ...state.settings }; }
  function getTimer() { return { ...state.timer, taskRef: state.timer.taskRef ? { ...state.timer.taskRef } : null }; }

  function addTask(dateKey, text) {
    const clean = clampString(String(text || '').replace(/\s+/g, ' '), 160);
    if (!clean) return null;
    const day = ensureDay(dateKey);
    const task = { id:createId('task'), text:clean, completed:false, important:false, core:false, order:day.tasks.length, createdAt:Date.now(), completedAt:null };
    day.tasks.push(task);
    return persist() ? { ...task } : null;
  }

  function updateTask(dateKey, taskId, patch) {
    const day = ensureDay(dateKey);
    const task = day.tasks.find(item => item.id === taskId);
    if (!task) return false;
    if (Object.prototype.hasOwnProperty.call(patch, 'text')) {
      const clean = clampString(String(patch.text || '').replace(/\s+/g, ' '), 160);
      if (!clean) return false;
      task.text = clean;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'completed')) {
      const next = Boolean(patch.completed);
      task.completed = next;
      task.completedAt = next ? Date.now() : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'important')) task.important = Boolean(patch.important);
    if (Object.prototype.hasOwnProperty.call(patch, 'core')) {
      const next = Boolean(patch.core);
      if (next && !task.core) {
        const coreCount = day.tasks.filter(item => item.core && item.id !== task.id).length;
        if (coreCount >= 3) return false;
      }
      task.core = next;
    }
    return persist();
  }

  function deleteTask(dateKey, taskId) {
    const day = ensureDay(dateKey);
    const before = day.tasks.length;
    day.tasks = day.tasks.filter(item => item.id !== taskId);
    day.tasks.forEach((task, index) => { task.order = index; });
    if (day.tasks.length === before) return false;
    if (state.timer.taskRef?.dateKey === dateKey && state.timer.taskRef?.taskId === taskId) state.timer.taskRef = null;
    return persist();
  }

  function moveTaskOrder(dateKey, taskId, direction) {
    const day = ensureDay(dateKey);
    const index = day.tasks.findIndex(item => item.id === taskId);
    if (index < 0) return false;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= day.tasks.length) return false;
    [day.tasks[index], day.tasks[target]] = [day.tasks[target], day.tasks[index]];
    day.tasks.forEach((task, order) => { task.order = order; });
    return persist();
  }

  function moveTaskDate(fromDateKey, taskId, toDateKey) {
    if (!isDateKey(toDateKey) || fromDateKey === toDateKey) return false;
    const fromDay = ensureDay(fromDateKey);
    const index = fromDay.tasks.findIndex(item => item.id === taskId);
    if (index < 0) return false;
    const [task] = fromDay.tasks.splice(index, 1);
    fromDay.tasks.forEach((item, order) => { item.order = order; });
    const toDay = ensureDay(toDateKey);
    task.order = toDay.tasks.length;
    task.core = false;
    toDay.tasks.push(task);
    if (state.timer.taskRef?.dateKey === fromDateKey && state.timer.taskRef?.taskId === taskId) state.timer.taskRef = { dateKey: toDateKey, taskId };
    return persist();
  }

  function addNote(dateKey, text) {
    const clean = clampString(String(text || '').replace(/\s+/g, ' '), 240);
    if (!clean) return null;
    const note = { id:createId('note'), text:clean, createdAt:Date.now(), updatedAt:null };
    ensureDay(dateKey).notes.unshift(note);
    return persist() ? { ...note } : null;
  }

  function updateNote(dateKey, noteId, text) {
    const clean = clampString(String(text || '').replace(/\s+/g, ' '), 240);
    if (!clean) return false;
    const note = ensureDay(dateKey).notes.find(item => item.id === noteId);
    if (!note) return false;
    note.text = clean;
    note.updatedAt = Date.now();
    return persist();
  }

  function deleteNote(dateKey, noteId) {
    const day = ensureDay(dateKey);
    const before = day.notes.length;
    day.notes = day.notes.filter(item => item.id !== noteId);
    return day.notes.length !== before ? persist() : false;
  }

  function setMood(dateKey, mood) {
    ensureDay(dateKey).mood = MOODS.includes(mood) ? mood : '';
    return persist();
  }

  function setJournal(dateKey, journal) {
    ensureDay(dateKey).journal = typeof journal === 'string' ? journal.slice(0, 180) : '';
    return persist();
  }

  function addRoutine(name, days) {
    const routine = sanitizeRoutine({ id:createId('routine'), name, days, createdAt:Date.now() });
    if (!routine) return null;
    state.routines.push(routine);
    return persist() ? { ...routine, days:[...routine.days] } : null;
  }

  function updateRoutine(routineId, patch) {
    const routine = state.routines.find(item => item.id === routineId);
    if (!routine) return false;
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const clean = clampString(patch.name, 80);
      if (!clean) return false;
      routine.name = clean;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'days')) {
      const days = Array.isArray(patch.days) ? [...new Set(patch.days.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a,b)=>a-b) : [];
      if (!days.length) return false;
      routine.days = days;
    }
    return persist();
  }

  function deleteRoutine(routineId) {
    const before = state.routines.length;
    state.routines = state.routines.filter(item => item.id !== routineId);
    if (state.routines.length === before) return false;
    Object.values(state.days).forEach(day => { if (day.routineChecks) delete day.routineChecks[routineId]; });
    return persist();
  }

  function setRoutineCheck(dateKey, routineId, completed) {
    const day = ensureDay(dateKey);
    day.routineChecks[routineId] = Boolean(completed);
    return persist();
  }

  function setProfile(patch) {
    state.profile = sanitizeProfile({ ...state.profile, ...patch });
    return persist();
  }

  function setTheme(theme) {
    if (!['system','light','dark'].includes(theme)) return false;
    state.settings.theme = theme;
    return persist();
  }

  function setTimer(nextTimer) {
    state.timer = sanitizeTimer({ ...state.timer, ...nextTimer });
    return persist();
  }

  function recordFocusSession(dateKey, payload) {
    const session = sanitizeFocusSession({ ...payload, id:createId('focus'), completedAt:Date.now() });
    if (!session) return false;
    ensureDay(dateKey).focusSessions.push(session);
    return persist();
  }

  function clearDay(dateKey) {
    if (!isDateKey(dateKey)) return false;
    delete state.days[dateKey];
    return persist();
  }

  function exportData() { return JSON.stringify(state, null, 2); }

  function importData(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const next = sanitizeState(parsed);
      if (!next || typeof next !== 'object') return false;
      try { localStorage.setItem(`${STORAGE_KEY}-before-import-${Date.now()}`, JSON.stringify(state)); } catch (_) { /* best effort */ }
      state = next;
      return persist();
    } catch (error) {
      console.warn('데이터 가져오기에 실패했습니다.', error);
      return false;
    }
  }

  function resetAll() {
    try { localStorage.setItem(`${STORAGE_KEY}-before-reset-${Date.now()}`, JSON.stringify(state)); } catch (_) { /* best effort */ }
    state = createDefaultState();
    return persist();
  }

  window.PlannerStorage = {
    getDay, getAllDays, getRoutines, getProfile, getSettings, getTimer,
    addTask, updateTask, deleteTask, moveTaskOrder, moveTaskDate,
    addNote, updateNote, deleteNote, setMood, setJournal,
    addRoutine, updateRoutine, deleteRoutine, setRoutineCheck,
    setProfile, setTheme, setTimer, recordFocusSession,
    clearDay, exportData, importData, resetAll
  };
})();

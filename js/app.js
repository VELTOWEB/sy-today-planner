(function () {
  'use strict';

  const S = window.PlannerStorage;
  const C = window.PlannerCalendar;
  const T = window.PlannerTimer;
  if (!S || !C || !T) {
    console.error('필수 모듈을 불러오지 못했습니다.');
    return;
  }

  const MOOD_LABELS = { good: '😊 좋음', normal: '😐 보통', sad: '😞 아쉬움' };
  const MOOD_EMOJI = { good: '😊', normal: '😐', sad: '😞' };
  const DAY_LABELS = ['일','월','화','수','목','금','토'];
  const els = {};
  let todayKey = C.getTodayKey();
  let selectedDateKey = todayKey;
  let calendarCursor = monthCursorFor(todayKey);
  let lastFocusedElement = null;
  let reflectionTimer = null;
  let currentView = 'today';
  let timerController = null;

  document.addEventListener('DOMContentLoaded', init, { once: true });

  function init() {
    cacheElements();
    applyTheme(S.getSettings().theme);
    bindEvents();
    timerController = T.createTimerController(S, renderTimer, handleFocusComplete);
    timerController.init();
    renderAll();
    setupViewportKeyboardHandling();
    registerServiceWorker();
    window.setInterval(refreshCurrentDate, 60000);
  }

  function cacheElements() {
    const ids = [
      'todayDateLabel','todayHeading','todayGreeting','todayCompletedCount','todayProgressPercent','todaySummaryMessage','todayProgressBar',
      'coreCount','coreList','todayTaskCount','todayTaskList','todayTaskForm','todayTaskInput','todayRoutineList',
      'focusDurationButton','focusTaskButton','focusTaskText','focusTimer','focusStartButton','focusResetButton',
      'noteCount','noteList','noteForm','noteInput','moodPicker','journalInput','reflectionSaveStatus','prepareTomorrowButton','tomorrowHint',
      'calendarMonthLabel','calendarGrid','prevMonthButton','nextMonthButton','goTodayButton','selectedDateYear','selectedDateTitle','selectedTaskCount','selectedTaskList','selectedTaskForm','selectedTaskInput',
      'routineWeeklyPercent','routineWeeklyBar','routineWeeklyText','addRoutineButton','routineList',
      'weekRange','weeklyTaskCount','weeklyRoutinePercent','weeklyBestDay','recordList',
      'todayView','calendarView','routineView','recordsView','modalBackdrop','modal','modalTitle','modalBody','modalActions','modalCloseButton','toastRegion','appMain'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
    els.navItems = Array.from(document.querySelectorAll('.nav-item'));
    els.viewPanels = Array.from(document.querySelectorAll('[data-view-panel]'));
    els.profileButtons = Array.from(document.querySelectorAll('[data-open-profile]'));
  }

  function bindEvents() {
    els.todayTaskForm.addEventListener('submit', event => { event.preventDefault(); addTaskFromInput(todayKey, els.todayTaskInput); });
    els.selectedTaskForm.addEventListener('submit', event => { event.preventDefault(); addTaskFromInput(selectedDateKey, els.selectedTaskInput); });
    els.todayTaskList.addEventListener('click', event => handleTaskListClick(event, todayKey));
    els.selectedTaskList.addEventListener('click', event => handleTaskListClick(event, selectedDateKey));
    els.coreList.addEventListener('click', handleCoreListClick);

    document.querySelectorAll('[data-go-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.goView)));
    els.navItems.forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    els.profileButtons.forEach(button => button.addEventListener('click', openProfile));

    els.prevMonthButton.addEventListener('click', () => changeMonth(-1));
    els.nextMonthButton.addEventListener('click', () => changeMonth(1));
    els.goTodayButton.addEventListener('click', goToTodayInCalendar);
    els.calendarMonthLabel.addEventListener('click', goToTodayInCalendar);
    els.calendarGrid.addEventListener('click', handleCalendarClick);

    els.addRoutineButton.addEventListener('click', () => openRoutineEditor());
    els.routineList.addEventListener('click', handleRoutineListClick);
    els.todayRoutineList.addEventListener('click', handleTodayRoutineClick);

    els.focusStartButton.addEventListener('click', toggleTimer);
    els.focusResetButton.addEventListener('click', () => timerController.reset());
    els.focusDurationButton.addEventListener('click', openDurationChooser);
    els.focusTaskButton.addEventListener('click', openFocusTaskChooser);

    els.noteForm.addEventListener('submit', event => { event.preventDefault(); addNote(); });
    els.noteList.addEventListener('click', handleNoteListClick);

    els.moodPicker.addEventListener('click', event => {
      const button = event.target.closest('[data-mood]');
      if (!button) return;
      const current = S.getDay(todayKey).mood;
      S.setMood(todayKey, current === button.dataset.mood ? '' : button.dataset.mood);
      renderReflection();
      renderRecords();
    });

    els.journalInput.addEventListener('input', () => {
      els.reflectionSaveStatus.textContent = '저장 중…';
      clearTimeout(reflectionTimer);
      reflectionTimer = setTimeout(() => {
        S.setJournal(todayKey, els.journalInput.value.trim());
        els.reflectionSaveStatus.textContent = '저장됨';
        renderRecords();
        setTimeout(() => { if (els.reflectionSaveStatus.textContent === '저장됨') els.reflectionSaveStatus.textContent = ''; }, 1100);
      }, 300);
    });

    els.prepareTomorrowButton.addEventListener('click', openTomorrowPrep);
    els.recordList.addEventListener('click', handleRecordClick);

    els.modalCloseButton.addEventListener('click', () => closeModal());
    els.modalBackdrop.addEventListener('click', event => { if (event.target === els.modalBackdrop) closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !els.modalBackdrop.hidden) closeModal(); });
  }

  function renderAll() {
    renderToday();
    renderCalendar();
    renderSelectedDay();
    renderRoutines();
    renderRecords();
    renderProfileButtons();
  }

  function renderToday() {
    const profile = S.getProfile();
    const day = S.getDay(todayKey);
    const completed = day.tasks.filter(task => task.completed).length;
    const total = day.tasks.length;
    const percent = total ? Math.round((completed / total) * 100) : 0;

    els.todayDateLabel.textContent = C.formatFullKorean(todayKey);
    els.todayHeading.textContent = `${profile.name.replace(/님$/, '')}님의 오늘`;
    els.todayGreeting.textContent = greetingForHour(C.getKoreaHour(), profile.name);
    els.todayCompletedCount.textContent = String(completed);
    els.todayProgressPercent.textContent = total ? `${percent}%` : '—';
    els.todayProgressBar.style.width = `${percent}%`;
    els.todaySummaryMessage.textContent = getSummaryMessage(day, profile.name);

    renderCore();
    renderTaskList(els.todayTaskList, todayKey, day.tasks);
    els.todayTaskCount.textContent = total ? `${total}개` : '0개';
    renderTodayRoutines();
    renderNotes();
    renderReflection();
    renderTomorrowHint();
    if (timerController) renderTimer(timerController.getState());
  }

  function greetingForHour(hour, name) {
    const displayName = name || '서윤';
    if (hour < 12) return `좋은 아침이에요, ${displayName}님 👋`;
    if (hour < 18) return `좋은 오후예요, ${displayName}님`;
    return `오늘도 수고했어요, ${displayName}님`;
  }

  function getSummaryMessage(day, name) {
    const remaining = day.tasks.filter(task => !task.completed).length;
    if (day.tasks.length && remaining === 0) return '오늘 할 일을 모두 완료했어요 🎉';
    if (remaining > 0) return `${name}님, 오늘 할 일 ${remaining}개가 남았어요.`;
    const yesterday = S.getDay(C.addDays(todayKey, -1));
    const carry = yesterday.tasks.filter(task => !task.completed).length;
    if (carry > 0) return `어제 못 끝낸 일이 ${carry}개 있어요. 필요한 것만 오늘로 가져와도 좋아요.`;
    return '오늘 아직 계획이 없어요. 가볍게 시작해볼까요?';
  }

  function renderCore() {
    const tasks = S.getDay(todayKey).tasks.filter(task => task.core).slice(0, 3);
    els.coreCount.textContent = `${tasks.length}/3`;
    if (!tasks.length) {
      els.coreList.innerHTML = '<div class="empty-state"><strong>핵심 목표가 아직 없어요.</strong>할 일 메뉴에서 최대 3개까지 핵심으로 지정할 수 있어요.</div>';
      return;
    }
    els.coreList.innerHTML = tasks.map((task, index) => `
      <article class="core-item ${task.completed ? 'is-completed' : ''}" data-task-id="${escapeAttr(task.id)}">
        <span class="core-index">${index + 1}</span>
        <p>${escapeHtml(task.text)}</p>
        <button type="button" data-core-action="toggle" aria-label="${task.completed ? '완료 취소' : '완료'}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="${task.completed ? 'm6 12 4 4 8-9' : 'M8 12h8'}"/></svg>
        </button>
      </article>`).join('');
  }

  function handleCoreListClick(event) {
    const item = event.target.closest('[data-task-id]');
    const button = event.target.closest('[data-core-action]');
    if (!item || !button) return;
    const day = S.getDay(todayKey);
    const task = day.tasks.find(entry => entry.id === item.dataset.taskId);
    if (!task) return;
    S.updateTask(todayKey, task.id, { completed: !task.completed });
    renderAfterTaskChange(todayKey);
  }

  function renderTaskList(container, dateKey, tasks) {
    if (!tasks.length) {
      const isToday = dateKey === todayKey;
      container.innerHTML = `<div class="empty-state"><strong>${isToday ? '오늘 계획이 아직 없어요.' : '이 날짜에는 계획이 없어요.'}</strong>${isToday ? '첫 할 일을 추가해보세요.' : '필요한 일을 미리 적어둘 수 있어요.'}</div>`;
      return;
    }
    container.innerHTML = tasks.map((task, index) => `
      <article class="task-item ${task.completed ? 'task-item--completed' : ''}" data-task-id="${escapeAttr(task.id)}">
        <button class="task-check" type="button" data-action="toggle" aria-label="${task.completed ? '완료 취소' : '완료'}" aria-pressed="${task.completed}"><span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></span></button>
        <div class="task-copy"><p>${escapeHtml(task.text)}</p><small>${task.core ? '<span class="task-badge">핵심</span>' : ''}${task.important ? '<span class="task-badge">중요</span>' : ''}</small></div>
        <button class="star-button" type="button" data-action="important" aria-label="중요 표시" aria-pressed="${task.important}">★</button>
        <button class="menu-button" type="button" data-action="menu" aria-label="할 일 메뉴"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01"/></svg></button>
        <span class="sr-only">${index + 1}번째 할 일</span>
      </article>`).join('');
  }

  function addTaskFromInput(dateKey, input) {
    const clean = input.value.replace(/\s+/g, ' ').trim();
    if (!clean) { input.focus(); return; }
    if (!S.addTask(dateKey, clean)) { showToast('할 일을 저장하지 못했습니다.'); return; }
    input.value = '';
    renderAfterTaskChange(dateKey);
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  function handleTaskListClick(event, dateKey) {
    const actionButton = event.target.closest('[data-action]');
    const item = event.target.closest('.task-item');
    if (!actionButton || !item) return;
    const task = S.getDay(dateKey).tasks.find(entry => entry.id === item.dataset.taskId);
    if (!task) return;
    const action = actionButton.dataset.action;
    if (action === 'toggle') S.updateTask(dateKey, task.id, { completed: !task.completed });
    if (action === 'important') S.updateTask(dateKey, task.id, { important: !task.important });
    if (action === 'menu') { openTaskMenu(dateKey, task); return; }
    renderAfterTaskChange(dateKey);
    if (action === 'toggle') {
      const updated = document.querySelector(`[data-task-id="${cssEscape(task.id)}"]`);
      if (updated) { updated.classList.add('task-pop'); setTimeout(() => updated.classList.remove('task-pop'), 250); }
    }
  }

  function openTaskMenu(dateKey, task) {
    const day = S.getDay(dateKey);
    const index = day.tasks.findIndex(item => item.id === task.id);
    const coreCount = day.tasks.filter(item => item.core).length;
    const items = [
      { label:'내용 수정', action:() => openEditTask(dateKey, task) },
      { label: task.core ? '핵심에서 해제' : (dateKey === todayKey ? '오늘의 핵심으로 지정' : '핵심 목표로 지정'), disabled: !task.core && coreCount >= 3, action:() => toggleCore(dateKey, task) },
      { label:'위로 이동', disabled:index === 0, action:() => reorderTask(dateKey, task.id, 'up') },
      { label:'아래로 이동', disabled:index === day.tasks.length - 1, action:() => reorderTask(dateKey, task.id, 'down') }
    ];
    if (dateKey === todayKey && !task.completed) items.push({ label:'이 할 일에 집중', action:() => selectFocusTask(dateKey, task.id) });
    if (!task.completed) items.push({ label:'다른 날짜로 이동', action:() => openMoveTask(dateKey, task) });
    items.push({ label:'삭제', danger:true, action:() => confirmDeleteTask(dateKey, task) });

    openMenuModal('할 일 메뉴', items);
  }

  function toggleCore(dateKey, task) {
    const ok = S.updateTask(dateKey, task.id, { core: !task.core });
    if (!ok && !task.core) showToast('핵심 목표는 최대 3개까지 지정할 수 있어요.');
    renderAfterTaskChange(dateKey);
  }

  function openEditTask(dateKey, task) {
    openModal('할 일 수정', `<label>할 일 내용<input id="modalTaskText" type="text" maxlength="160" value="${escapeAttr(task.text)}" enterkeyhint="done"></label>`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:'저장', className:'primary', action:() => {
        const input = document.getElementById('modalTaskText');
        const clean = input.value.replace(/\s+/g, ' ').trim();
        if (!clean) { input.focus(); return; }
        S.updateTask(dateKey, task.id, { text:clean });
        closeModal(false); renderAfterTaskChange(dateKey); showToast('수정했습니다.');
      }}
    ]);
    focusModalInput('modalTaskText', true);
  }

  function openMoveTask(dateKey, task) {
    openModal('다른 날짜로 이동', `<p>이 할 일을 이동할 날짜를 선택하세요.</p><label>이동 날짜<input id="modalMoveDate" type="date" value="${escapeAttr(C.addDays(todayKey, 1))}"></label>`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:'이동', className:'primary', action:() => {
        const value = document.getElementById('modalMoveDate').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
        if (value === dateKey) { showToast('현재 날짜와 같습니다.'); return; }
        moveTask(dateKey, task.id, value); closeModal(false);
      }}
    ]);
  }

  function moveTask(fromDateKey, taskId, toDateKey) {
    if (!S.moveTaskDate(fromDateKey, taskId, toDateKey)) { showToast('이동하지 못했습니다.'); return; }
    renderAfterTaskChange(fromDateKey);
    renderAfterTaskChange(toDateKey);
    showToast(`${C.formatShortKorean(toDateKey)}로 이동했습니다.`);
  }

  function reorderTask(dateKey, taskId, direction) {
    if (S.moveTaskOrder(dateKey, taskId, direction)) renderAfterTaskChange(dateKey);
  }

  function confirmDeleteTask(dateKey, task) {
    openModal('할 일을 삭제할까요?', `<p>“${escapeHtml(task.text)}” 항목이 삭제됩니다.</p>`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:'삭제', className:'danger', action:() => { S.deleteTask(dateKey, task.id); closeModal(false); renderAfterTaskChange(dateKey); showToast('삭제했습니다.'); }}
    ]);
  }

  function renderAfterTaskChange(dateKey) {
    if (dateKey === todayKey) renderToday();
    if (dateKey === selectedDateKey) renderSelectedDay();
    renderCalendar();
    renderRecords();
  }

  function renderTodayRoutines() {
    const routines = S.getRoutines().filter(routine => C.isRoutineDue(routine, todayKey));
    const day = S.getDay(todayKey);
    if (!routines.length) {
      els.todayRoutineList.innerHTML = '<div class="empty-state"><strong>오늘 예정된 루틴이 없어요.</strong>루틴 탭에서 반복하고 싶은 작은 습관을 추가해보세요.</div>';
      return;
    }
    els.todayRoutineList.innerHTML = routines.map(routine => {
      const done = Boolean(day.routineChecks[routine.id]);
      const stats = getRoutineWeekStats(routine);
      return `<div class="routine-quick-item" data-routine-id="${escapeAttr(routine.id)}">
        <button class="routine-check" type="button" data-routine-check aria-label="${done ? '루틴 완료 취소' : '루틴 완료'}" aria-pressed="${done}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></button>
        <strong>${escapeHtml(routine.name)}</strong><span>이번 주 ${stats.completed}/${stats.due}</span>
      </div>`;
    }).join('');
  }

  function handleTodayRoutineClick(event) {
    const button = event.target.closest('[data-routine-check]');
    const item = event.target.closest('[data-routine-id]');
    if (!button || !item) return;
    const day = S.getDay(todayKey);
    S.setRoutineCheck(todayKey, item.dataset.routineId, !Boolean(day.routineChecks[item.dataset.routineId]));
    renderTodayRoutines(); renderRoutines(); renderRecords();
  }

  function renderRoutines() {
    const routines = S.getRoutines();
    const today = S.getDay(todayKey);
    const weekly = getAllRoutineWeekStats();
    els.routineWeeklyPercent.textContent = weekly.due ? `${weekly.percent}%` : '—';
    els.routineWeeklyBar.style.width = `${weekly.due ? weekly.percent : 0}%`;
    els.routineWeeklyText.textContent = weekly.due ? `${weekly.completed}회 완료 · 예정 ${weekly.due}회` : '루틴을 추가하면 진행률을 볼 수 있어요.';

    if (!routines.length) {
      els.routineList.innerHTML = '<div class="empty-state"><strong>아직 루틴이 없어요.</strong>반복하고 싶은 작은 습관을 하나 추가해보세요.</div>';
      return;
    }
    const weekKeys = C.getWeekKeys(todayKey);
    els.routineList.innerHTML = routines.map(routine => {
      const dueToday = C.isRoutineDue(routine, todayKey);
      const doneToday = Boolean(today.routineChecks[routine.id]);
      const stats = getRoutineWeekStats(routine);
      const dots = weekKeys.map(key => {
        const due = C.isRoutineDue(routine, key);
        const done = Boolean(S.getDay(key).routineChecks[routine.id]);
        return `<i class="week-dot ${done ? 'is-done' : ''} ${!due ? 'is-skipped' : ''}" title="${C.shortWeekday(key)}"></i>`;
      }).join('');
      return `<article class="routine-card" data-routine-id="${escapeAttr(routine.id)}">
        <div class="routine-card-top">
          <button class="routine-check" type="button" data-routine-toggle ${dueToday ? '' : 'disabled'} aria-label="${dueToday ? (doneToday ? '오늘 완료 취소' : '오늘 완료') : '오늘 반복 아님'}" aria-pressed="${doneToday}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></button>
          <div class="routine-card-copy"><strong>${escapeHtml(routine.name)}</strong><span>${formatRoutineDays(routine.days)}</span></div>
          <button class="routine-menu" type="button" data-routine-menu aria-label="루틴 메뉴"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01"/></svg></button>
        </div>
        <div class="routine-week-line"><span>이번 주 ${stats.completed}/${stats.due}회</span><span class="week-dots">${dots}</span></div>
      </article>`;
    }).join('');
  }

  function handleRoutineListClick(event) {
    const card = event.target.closest('[data-routine-id]');
    if (!card) return;
    const routine = S.getRoutines().find(item => item.id === card.dataset.routineId);
    if (!routine) return;
    if (event.target.closest('[data-routine-toggle]')) {
      if (!C.isRoutineDue(routine, todayKey)) return;
      const day = S.getDay(todayKey);
      S.setRoutineCheck(todayKey, routine.id, !Boolean(day.routineChecks[routine.id]));
      renderTodayRoutines(); renderRoutines(); renderRecords();
      return;
    }
    if (event.target.closest('[data-routine-menu]')) {
      openMenuModal('루틴 메뉴', [
        { label:'루틴 수정', action:() => openRoutineEditor(routine) },
        { label:'삭제', danger:true, action:() => confirmDeleteRoutine(routine) }
      ]);
    }
  }

  function openRoutineEditor(routine = null) {
    const selectedDays = routine ? routine.days : [0,1,2,3,4,5,6];
    const dayChecks = DAY_LABELS.map((label, index) => `<label class="check-row"><input type="checkbox" name="routineDay" value="${index}" ${selectedDays.includes(index) ? 'checked' : ''}><span>${label}요일</span></label>`).join('');
    openModal(routine ? '루틴 수정' : '루틴 추가', `
      <label>루틴 이름<input id="routineNameInput" type="text" maxlength="80" value="${routine ? escapeAttr(routine.name) : ''}" placeholder="예: 운동, 책 읽기"></label>
      <label>반복 요일</label><div class="check-list">${dayChecks}</div>`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:routine ? '저장' : '추가', className:'primary', action:() => {
        const name = document.getElementById('routineNameInput').value.trim();
        const days = Array.from(els.modalBody.querySelectorAll('input[name="routineDay"]:checked')).map(input => Number(input.value));
        if (!name) { document.getElementById('routineNameInput').focus(); return; }
        if (!days.length) { showToast('반복 요일을 하나 이상 선택해주세요.'); return; }
        const ok = routine ? S.updateRoutine(routine.id, { name, days }) : Boolean(S.addRoutine(name, days));
        if (!ok) { showToast('루틴을 저장하지 못했습니다.'); return; }
        closeModal(false); renderTodayRoutines(); renderRoutines(); renderRecords(); showToast(routine ? '루틴을 수정했습니다.' : '루틴을 추가했습니다.');
      }}
    ]);
    focusModalInput('routineNameInput', Boolean(routine));
  }

  function confirmDeleteRoutine(routine) {
    openModal('루틴을 삭제할까요?', `<p>“${escapeHtml(routine.name)}” 루틴과 체크 기록이 삭제됩니다.</p>`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:'삭제', className:'danger', action:() => { S.deleteRoutine(routine.id); closeModal(false); renderTodayRoutines(); renderRoutines(); renderRecords(); showToast('루틴을 삭제했습니다.'); }}
    ]);
  }

  function formatRoutineDays(days) {
    if (days.length === 7) return '매일';
    if (days.length === 5 && [1,2,3,4,5].every(day => days.includes(day))) return '평일';
    return days.map(day => DAY_LABELS[day]).join(' · ');
  }

  function getRoutineWeekStats(routine) {
    const keys = C.getWeekKeys(todayKey);
    let due = 0; let completed = 0;
    keys.forEach(key => {
      if (!C.isRoutineDue(routine, key)) return;
      due += 1;
      if (S.getDay(key).routineChecks[routine.id]) completed += 1;
    });
    return { due, completed, percent: due ? Math.round((completed / due) * 100) : 0 };
  }

  function getAllRoutineWeekStats() {
    const routines = S.getRoutines();
    let due = 0; let completed = 0;
    routines.forEach(routine => { const stats = getRoutineWeekStats(routine); due += stats.due; completed += stats.completed; });
    return { due, completed, percent: due ? Math.round((completed / due) * 100) : 0 };
  }

  function renderTimer(timerState) {
    if (!timerState || !els.focusTimer) return;
    const seconds = Math.max(0, Math.round(timerState.remainingSec));
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    els.focusTimer.textContent = `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    els.focusStartButton.textContent = timerState.running ? '일시정지' : (seconds < timerState.durationSec ? '재개' : '시작');
    els.focusDurationButton.textContent = `${Math.round(timerState.durationSec / 60)}분`;
    const ref = timerState.taskRef;
    let taskText = '할 일을 선택하지 않았어요';
    if (ref) {
      const task = S.getDay(ref.dateKey).tasks.find(item => item.id === ref.taskId);
      if (task) taskText = task.text;
    }
    els.focusTaskText.textContent = taskText;
  }

  function toggleTimer() {
    const state = timerController.getState();
    if (state.running) timerController.pause(); else timerController.startOrResume();
  }

  function openDurationChooser() {
    const options = [15,25,30,45,60];
    openModal('집중 시간', `<div class="choice-list">${options.map(min => `<button class="choice-button" type="button" data-duration="${min*60}"><strong>${min}분</strong><span>${min === 25 ? '기본' : ''}</span></button>`).join('')}</div>`, []);
    els.modalBody.querySelectorAll('[data-duration]').forEach(button => button.addEventListener('click', () => {
      timerController.setDuration(Number(button.dataset.duration)); closeModal(false); showToast(`${Number(button.dataset.duration)/60}분으로 설정했습니다.`);
    }));
  }

  function openFocusTaskChooser() {
    const tasks = S.getDay(todayKey).tasks.filter(task => !task.completed);
    const choices = [`<button class="choice-button" type="button" data-focus-none><strong>선택 안 함</strong><span>타이머만 사용</span></button>`]
      .concat(tasks.map(task => `<button class="choice-button" type="button" data-focus-task="${escapeAttr(task.id)}"><strong>${escapeHtml(task.text)}</strong><span>${task.core ? '핵심' : ''}</span></button>`));
    openModal('집중할 일 선택', tasks.length ? `<div class="choice-list">${choices.join('')}</div>` : `<div class="empty-state"><strong>미완료 할 일이 없어요.</strong>타이머만 사용하거나 할 일을 먼저 추가해보세요.</div><div class="choice-list" style="margin-top:10px">${choices[0]}</div>`, []);
    els.modalBody.querySelector('[data-focus-none]')?.addEventListener('click', () => { timerController.setTaskRef(null); closeModal(false); });
    els.modalBody.querySelectorAll('[data-focus-task]').forEach(button => button.addEventListener('click', () => { selectFocusTask(todayKey, button.dataset.focusTask); closeModal(false); }));
  }

  function selectFocusTask(dateKey, taskId) {
    timerController.setTaskRef({ dateKey, taskId });
    const task = S.getDay(dateKey).tasks.find(item => item.id === taskId);
    if (task) showToast(`“${task.text}”에 집중할 준비가 됐어요.`);
  }

  function handleFocusComplete(previousState) {
    const ref = previousState.taskRef;
    let taskText = '';
    if (ref) taskText = S.getDay(ref.dateKey).tasks.find(item => item.id === ref.taskId)?.text || '';
    S.recordFocusSession(todayKey, { taskId: ref?.taskId || '', taskText, durationSec: previousState.durationSec });
    renderRecords();
    showToast(taskText ? `집중 완료 · ${taskText}` : '집중 시간이 끝났어요. 잘했어요!');
    if ('vibrate' in navigator) navigator.vibrate?.(80);
  }

  function renderNotes() {
    const notes = S.getDay(todayKey).notes;
    els.noteCount.textContent = `${notes.length}개`;
    if (!notes.length) {
      els.noteList.innerHTML = '<div class="empty-state"><strong>빠른 메모가 비어 있어요.</strong>나중에 기억할 내용을 짧게 남겨보세요.</div>';
      return;
    }
    els.noteList.innerHTML = notes.map(note => `
      <article class="note-item" data-note-id="${escapeAttr(note.id)}"><p>${escapeHtml(note.text)}</p><time>${formatTime(note.createdAt)}</time>
        <div class="note-actions"><button type="button" data-note-action="edit" aria-label="메모 수정"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg></button><button type="button" data-note-action="delete" aria-label="메모 삭제"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg></button></div>
      </article>`).join('');
  }

  function addNote() {
    const clean = els.noteInput.value.replace(/\s+/g, ' ').trim();
    if (!clean) { els.noteInput.focus(); return; }
    if (!S.addNote(todayKey, clean)) { showToast('메모를 저장하지 못했습니다.'); return; }
    els.noteInput.value = ''; renderNotes(); renderRecords();
    requestAnimationFrame(() => els.noteInput.focus({ preventScroll:true }));
  }

  function handleNoteListClick(event) {
    const item = event.target.closest('[data-note-id]');
    const button = event.target.closest('[data-note-action]');
    if (!item || !button) return;
    const note = S.getDay(todayKey).notes.find(entry => entry.id === item.dataset.noteId);
    if (!note) return;
    if (button.dataset.noteAction === 'delete') { S.deleteNote(todayKey, note.id); renderNotes(); renderRecords(); showToast('메모를 삭제했습니다.'); return; }
    openModal('메모 수정', `<label>메모 내용<textarea id="modalNoteText" maxlength="240">${escapeHtml(note.text)}</textarea></label>`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:'저장', className:'primary', action:() => {
        const input = document.getElementById('modalNoteText'); const clean = input.value.replace(/\s+/g,' ').trim();
        if (!clean) { input.focus(); return; }
        S.updateNote(todayKey, note.id, clean); closeModal(false); renderNotes(); renderRecords(); showToast('메모를 수정했습니다.');
      }}
    ]);
    focusModalInput('modalNoteText', true);
  }

  function renderReflection() {
    const day = S.getDay(todayKey);
    els.moodPicker.querySelectorAll('[data-mood]').forEach(button => {
      const active = button.dataset.mood === day.mood;
      button.setAttribute('aria-checked', String(active));
    });
    if (document.activeElement !== els.journalInput) els.journalInput.value = day.journal;
  }

  function renderTomorrowHint() {
    const remaining = S.getDay(todayKey).tasks.filter(task => !task.completed).length;
    els.tomorrowHint.textContent = remaining ? `완료하지 못한 할 일이 ${remaining}개 있어요. 필요한 것만 내일로 옮길 수 있어요.` : '내일의 첫 할 일을 미리 정해보세요.';
  }

  function openTomorrowPrep() {
    const tomorrowKey = C.addDays(todayKey, 1);
    const incomplete = S.getDay(todayKey).tasks.filter(task => !task.completed);
    const list = incomplete.length ? `<div class="check-list">${incomplete.map(task => `<label class="check-row"><input type="checkbox" name="carryTask" value="${escapeAttr(task.id)}"><span>${escapeHtml(task.text)}</span></label>`).join('')}</div>` : '<p>오늘 남은 할 일이 없어요.</p>';
    openModal('내일 준비하기', `
      <p><strong>${escapeHtml(C.formatFullKorean(tomorrowKey))}</strong> 계획을 준비해요.</p>
      <label>내일 새 할 일<input id="tomorrowNewTask" type="text" maxlength="160" placeholder="내일 해야 할 일"></label>
      <label>오늘 미완료 할 일 중 옮길 항목</label>${list}`, [
      { label:'취소', className:'secondary', action:() => closeModal() },
      { label:'내일에 저장', className:'primary', action:() => {
        const newText = document.getElementById('tomorrowNewTask').value.replace(/\s+/g,' ').trim();
        const selected = Array.from(els.modalBody.querySelectorAll('input[name="carryTask"]:checked')).map(input => input.value);
        if (!newText && !selected.length) { showToast('새 할 일을 입력하거나 옮길 항목을 선택해주세요.'); return; }
        selected.forEach(taskId => S.moveTaskDate(todayKey, taskId, tomorrowKey));
        if (newText) S.addTask(tomorrowKey, newText);
        closeModal(false); renderAll(); showToast('내일 계획에 저장했습니다.');
      }}
    ]);
    focusModalInput('tomorrowNewTask');
  }

  function renderCalendar() {
    const { year, monthIndex } = calendarCursor;
    els.calendarMonthLabel.textContent = `${year}년 ${monthIndex + 1}월`;
    const allDays = S.getAllDays();
    els.calendarGrid.innerHTML = C.getMonthMatrix(year, monthIndex).map(cell => {
      const classes = ['calendar-day'];
      if (!cell.isCurrentMonth) classes.push('calendar-day--outside');
      if (cell.dateKey === todayKey) classes.push('calendar-day--today');
      if (cell.dateKey === selectedDateKey) classes.push('calendar-day--selected');
      const hasTasks = Boolean(allDays[cell.dateKey]?.tasks?.length);
      const label = `${C.formatFullKorean(cell.dateKey)}${hasTasks ? ', 할 일 있음' : ''}`;
      return `<button type="button" class="${classes.join(' ')}" role="gridcell" data-date-key="${cell.dateKey}" aria-label="${escapeAttr(label)}" aria-selected="${cell.dateKey === selectedDateKey}"><span>${cell.day}</span>${hasTasks ? '<i class="calendar-dot" aria-hidden="true"></i>' : ''}</button>`;
    }).join('');
  }

  function renderSelectedDay() {
    const day = S.getDay(selectedDateKey);
    const date = C.fromDateKey(selectedDateKey);
    els.selectedDateYear.textContent = `${date.getFullYear()}년 · ${selectedDateKey === todayKey ? '오늘' : '선택한 날짜'}`;
    els.selectedDateTitle.textContent = C.formatFullKorean(selectedDateKey);
    els.selectedTaskCount.textContent = `${day.tasks.length}개`;
    renderTaskList(els.selectedTaskList, selectedDateKey, day.tasks);
  }

  function handleCalendarClick(event) {
    const button = event.target.closest('[data-date-key]');
    if (!button) return;
    selectedDateKey = button.dataset.dateKey;
    const selected = C.fromDateKey(selectedDateKey);
    if (selected.getFullYear() !== calendarCursor.year || selected.getMonth() !== calendarCursor.monthIndex) calendarCursor = { year:selected.getFullYear(), monthIndex:selected.getMonth() };
    renderCalendar(); renderSelectedDay();
    setTimeout(() => document.querySelector('.selected-day-section')?.scrollIntoView({ behavior:'smooth', block:'start' }), 20);
  }

  function changeMonth(delta) { calendarCursor = C.shiftMonth(calendarCursor.year, calendarCursor.monthIndex, delta); renderCalendar(); }
  function goToTodayInCalendar() { selectedDateKey = todayKey; calendarCursor = monthCursorFor(todayKey); renderCalendar(); renderSelectedDay(); }

  function renderRecords() {
    const weekKeys = C.getWeekKeys(todayKey);
    els.weekRange.textContent = C.formatWeekRange(weekKeys);
    const weekDays = weekKeys.map(key => ({ key, day:S.getDay(key) }));
    const completedCounts = weekDays.map(entry => entry.day.tasks.filter(task => task.completed).length);
    const weeklyTaskCount = completedCounts.reduce((sum, count) => sum + count, 0);
    const maxCount = Math.max(0, ...completedCounts);
    const bestIndex = maxCount > 0 ? completedCounts.indexOf(maxCount) : -1;
    const routineStats = getAllRoutineWeekStats();
    els.weeklyTaskCount.textContent = String(weeklyTaskCount);
    els.weeklyRoutinePercent.textContent = routineStats.due ? `${routineStats.percent}%` : '—';
    els.weeklyBestDay.textContent = bestIndex >= 0 ? `${C.shortWeekday(weekKeys[bestIndex])}요일` : '—';

    const records = Object.keys(S.getAllDays())
      .filter(key => key <= todayKey)
      .map(key => ({ key, day:S.getDay(key) }))
      .filter(entry => entry.day.mood || entry.day.journal || entry.day.tasks.length || entry.day.notes.length || entry.day.focusSessions.length)
      .sort((a,b) => b.key.localeCompare(a.key));

    if (!records.length) {
      els.recordList.innerHTML = '<div class="empty-state"><strong>아직 남긴 기록이 없어요.</strong>하루를 기록하면 이곳에서 다시 볼 수 있어요.</div>';
      return;
    }
    els.recordList.innerHTML = records.map(entry => {
      const completed = entry.day.tasks.filter(task => task.completed).length;
      const mood = entry.day.mood ? MOOD_EMOJI[entry.day.mood] : '';
      return `<button type="button" class="record-card" data-record-key="${entry.key}">
        <span class="record-card-top"><span class="record-card-date">${escapeHtml(C.formatRecordDate(entry.key))}</span><span class="record-card-mood">${mood}</span></span>
        <span class="record-card-meta">할 일 ${entry.day.tasks.length}개 중 ${completed}개 완료${entry.day.focusSessions.length ? ` · 집중 ${entry.day.focusSessions.length}회` : ''}</span>
        ${entry.day.journal ? `<span class="record-card-journal">“${escapeHtml(entry.day.journal)}”</span>` : ''}
      </button>`;
    }).join('');
  }

  function handleRecordClick(event) {
    const card = event.target.closest('[data-record-key]');
    if (!card) return;
    const key = card.dataset.recordKey;
    const day = S.getDay(key);
    const completed = day.tasks.filter(task => task.completed).length;
    const completedTasks = day.tasks.filter(task => task.completed).map(task => `<li>${escapeHtml(task.text)}</li>`).join('');
    openModal(C.formatRecordDate(key), `
      <p>${day.mood ? MOOD_LABELS[day.mood] : '기분 기록 없음'} · 할 일 ${day.tasks.length}개 중 ${completed}개 완료</p>
      ${day.journal ? `<p><strong>한 줄 기록</strong><br>${escapeHtml(day.journal)}</p>` : ''}
      ${completedTasks ? `<p><strong>완료한 일</strong></p><ul>${completedTasks}</ul>` : ''}
      ${day.focusSessions.length ? `<p><strong>집중</strong><br>${day.focusSessions.length}회 · ${Math.round(day.focusSessions.reduce((sum,s)=>sum+s.durationSec,0)/60)}분</p>` : ''}`, [
      { label:'닫기', className:'secondary', action:() => closeModal() }
    ]);
  }

  function switchView(view) {
    if (!['today','calendar','routine','records'].includes(view)) return;
    currentView = view;
    els.viewPanels.forEach(panel => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('view--active', active);
    });
    els.navItems.forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('nav-item--active', active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    if (view === 'today') renderToday();
    if (view === 'calendar') { renderCalendar(); renderSelectedDay(); }
    if (view === 'routine') renderRoutines();
    if (view === 'records') renderRecords();
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function profileInitials(profile) {
    return profile.name ? profile.name.trim().slice(-2) : '서윤';
  }

  function renderProfileButtons() {
    const profile = S.getProfile();
    els.profileButtons.forEach(button => {
      button.replaceChildren();
      if (profile.photo) {
        const img = document.createElement('img');
        img.src = profile.photo;
        img.alt = '';
        img.decoding = 'async';
        button.appendChild(img);
        button.classList.add('has-photo');
      } else {
        const span = document.createElement('span');
        span.textContent = profileInitials(profile);
        button.appendChild(span);
        button.classList.remove('has-photo');
      }
    });
  }

  function profileAvatarMarkup(profile) {
    if (profile.photo) {
      return `<div class="profile-avatar profile-avatar--photo"><img src="${escapeAttr(profile.photo)}" alt="${escapeAttr(profile.name)} 프로필 사진"></div>`;
    }
    return `<div class="profile-avatar">${escapeHtml(profileInitials(profile))}</div>`;
  }

  function openProfile() {
    const profile = S.getProfile();
    const settings = S.getSettings();
    openModal('프로필 · 설정', `
      <div class="profile-hero">${profileAvatarMarkup(profile)}<div><h3>${escapeHtml(profile.name)}</h3><p>${profile.age}세 · ${profile.gender === 'female' ? '남자' : profile.gender === 'male' ? '남자' : '기타'}</p><p>${escapeHtml(profile.status)}</p></div></div>
      <div class="settings-group"><h4>프로필 사진</h4><div class="data-actions"><button type="button" data-setting="photo">${profile.photo ? '사진 변경' : '사진 보관함에서 선택'}</button>${profile.photo ? '<button type="button" data-setting="photo-remove" class="danger">사진 삭제 · 기본 아바타로 되돌리기</button>' : ''}</div><p class="settings-help">iPhone에서는 사진 보관함에서 원하는 이미지를 고를 수 있어요. 선택한 사진은 앱 안에서 작게 압축해 저장됩니다.</p></div>
      <div class="settings-group"><h4>개인화</h4><div class="data-actions"><button type="button" data-setting="profile">이름 · 상태 문구 수정</button></div></div>
      <div class="settings-group"><h4>테마</h4><div class="segmented">${['system','light','dark'].map(theme => `<button type="button" data-theme-choice="${theme}" class="${settings.theme === theme ? 'is-active' : ''}">${theme === 'system' ? '시스템' : theme === 'light' ? '라이트' : '다크'}</button>`).join('')}</div></div>
      <div class="settings-group"><h4>데이터 관리</h4><div class="data-actions"><button type="button" data-setting="export">데이터 백업 내보내기</button><button type="button" data-setting="import">백업 데이터 가져오기</button><button type="button" data-setting="reset" class="danger">앱 데이터 전체 초기화</button></div></div>`, []);

    els.modalBody.querySelector('[data-setting="photo"]').addEventListener('click', chooseProfilePhoto);
    els.modalBody.querySelector('[data-setting="photo-remove"]')?.addEventListener('click', removeProfilePhoto);
    els.modalBody.querySelector('[data-setting="profile"]').addEventListener('click', openProfileEditor);
    els.modalBody.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => {
      const theme = button.dataset.themeChoice; S.setTheme(theme); applyTheme(theme); openProfile();
    }));
    els.modalBody.querySelector('[data-setting="export"]').addEventListener('click', exportBackup);
    els.modalBody.querySelector('[data-setting="import"]').addEventListener('click', openImportBackup);
    els.modalBody.querySelector('[data-setting="reset"]').addEventListener('click', confirmResetAll);
  }

  function chooseProfilePhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('aria-label', '프로필 사진 선택');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (!file.type.startsWith('image/')) { showToast('이미지 파일을 선택해주세요.'); return; }
      try {
        showToast('프로필 사진을 준비하고 있어요.');
        const photo = await cropAndCompressProfilePhoto(file);
        if (!S.setProfile({ photo })) throw new Error('save-failed');
        renderProfileButtons();
        openProfile();
        showToast('프로필 사진을 변경했습니다.');
      } catch (error) {
        console.error('프로필 사진 처리 실패', error);
        showToast('사진을 저장하지 못했습니다. 다른 사진으로 다시 시도해주세요.');
      }
    }, { once:true });
    input.click();
  }

  function cropAndCompressProfilePhoto(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const sourceWidth = img.naturalWidth || img.width;
          const sourceHeight = img.naturalHeight || img.height;
          if (!sourceWidth || !sourceHeight) throw new Error('invalid-image-size');
          const side = Math.min(sourceWidth, sourceHeight);
          const sx = Math.max(0, (sourceWidth - side) / 2);
          const sy = Math.max(0, (sourceHeight - side) / 2);
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 320;
          const context = canvas.getContext('2d', { alpha:false });
          if (!context) throw new Error('canvas-unavailable');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(img, sx, sy, side, side, 0, 0, 320, 320);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
          if (!dataUrl || dataUrl.length > 650000) throw new Error('image-too-large');
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image-load-failed')); };
      img.src = objectUrl;
    });
  }

  function removeProfilePhoto() {
    S.setProfile({ photo:'' });
    renderProfileButtons();
    openProfile();
    showToast('프로필 사진을 삭제했습니다.');
  }

  function openProfileEditor() {
    const profile = S.getProfile();
    openModal('프로필 수정', `<label>이름<input id="profileNameInput" type="text" maxlength="30" value="${escapeAttr(profile.name)}"></label><label>상태 문구<input id="profileStatusInput" type="text" maxlength="80" value="${escapeAttr(profile.status)}"></label>`, [
      { label:'취소', className:'secondary', action:() => openProfile() },
      { label:'저장', className:'primary', action:() => {
        const name = document.getElementById('profileNameInput').value.trim(); const status = document.getElementById('profileStatusInput').value.trim();
        if (!name) { document.getElementById('profileNameInput').focus(); return; }
        S.setProfile({ name, status: status || '오늘도 하나씩 해내는 중.' }); closeModal(false); renderAll(); showToast('프로필을 저장했습니다.');
      }}
    ]);
    focusModalInput('profileNameInput', true);
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = theme;
    updateThemeColor(theme);
  }

  function updateThemeColor(theme) {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#171416' : '#faf7f8');
  }

  function exportBackup() {
    const blob = new Blob([S.exportData()], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `today-planner-backup-${todayKey}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    showToast('백업 파일을 만들었습니다.');
  }

  function openImportBackup() {
    openModal('백업 데이터 가져오기', `<p>이 앱에서 내보낸 JSON 백업 파일을 선택하세요. 현재 데이터는 가져오기 직전 자동 백업을 시도합니다.</p><label>백업 파일<input id="backupFileInput" type="file" accept="application/json,.json"></label>`, [
      { label:'취소', className:'secondary', action:() => openProfile() },
      { label:'가져오기', className:'primary', action:async () => {
        const file = document.getElementById('backupFileInput').files?.[0];
        if (!file) { showToast('백업 파일을 선택해주세요.'); return; }
        const text = await file.text();
        if (!S.importData(text)) { showToast('올바른 백업 파일인지 확인해주세요.'); return; }
        closeModal(false); todayKey = C.getTodayKey(); selectedDateKey = todayKey; calendarCursor = monthCursorFor(todayKey); applyTheme(S.getSettings().theme); renderAll(); timerController.reset(); showToast('백업 데이터를 가져왔습니다.');
      }}
    ]);
  }

  function confirmResetAll() {
    openModal('앱 데이터를 초기화할까요?', '<p>할 일, 루틴, 기록, 메모, 설정이 모두 초기화됩니다. 실행 직전 기존 데이터는 브라우저 저장소에 백업을 시도하지만, 일반 화면에서는 되돌리기 기능을 제공하지 않습니다.</p>', [
      { label:'취소', className:'secondary', action:() => openProfile() },
      { label:'전체 초기화', className:'danger', action:() => { S.resetAll(); closeModal(false); todayKey = C.getTodayKey(); selectedDateKey = todayKey; calendarCursor = monthCursorFor(todayKey); applyTheme(S.getSettings().theme); renderAll(); timerController.reset(); showToast('앱 데이터를 초기화했습니다.'); }}
    ]);
  }

  function openMenuModal(title, items) {
    openModal(title, `<div class="modal-menu">${items.map((item,index) => `<button type="button" data-menu-index="${index}" ${item.disabled ? 'disabled' : ''} class="${item.danger ? 'danger' : ''}">${escapeHtml(item.label)}</button>`).join('')}</div>`, []);
    els.modalBody.querySelectorAll('[data-menu-index]').forEach(button => button.addEventListener('click', () => {
      const item = items[Number(button.dataset.menuIndex)];
      if (!item || item.disabled) return;
      closeModal(false); item.action();
    }));
  }

  function openModal(title, bodyHtml, actions) {
    lastFocusedElement = document.activeElement;
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = bodyHtml;
    els.modalActions.innerHTML = '';
    actions.forEach(action => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label; button.className = action.className || 'secondary'; button.addEventListener('click', action.action); els.modalActions.appendChild(button);
    });
    els.modalActions.hidden = actions.length === 0;
    els.modalBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => els.modalCloseButton.focus({ preventScroll:true }), 10);
  }

  function closeModal(restoreFocus = true) {
    els.modalBackdrop.hidden = true;
    document.body.style.overflow = '';
    els.modalBody.innerHTML = '';
    els.modalActions.innerHTML = '';
    if (restoreFocus && lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus({ preventScroll:true });
  }

  function focusModalInput(id, select = false) {
    setTimeout(() => { const input = document.getElementById(id); if (!input) return; input.focus(); if (select && typeof input.select === 'function') input.select(); }, 40);
  }

  function showToast(message) {
    const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; els.toastRegion.appendChild(toast); setTimeout(() => toast.remove(), 2300);
  }

  function refreshCurrentDate() {
    const current = C.getTodayKey();
    if (current === todayKey) return;
    const previous = todayKey;
    todayKey = current;
    if (selectedDateKey === previous) selectedDateKey = todayKey;
    calendarCursor = monthCursorFor(todayKey);
    renderAll();
  }

  function setupViewportKeyboardHandling() {
    if (!window.visualViewport) return;
    const update = () => {
      const difference = window.innerHeight - window.visualViewport.height;
      document.body.classList.toggle('keyboard-open', difference > 140);
    };
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    update();
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope:'./' });
      registration.update().catch(() => {});
    } catch (error) { console.warn('Service Worker 등록에 실패했습니다.', error); }
  }

  function monthCursorFor(dateKey) { const date = C.fromDateKey(dateKey); return { year:date.getFullYear(), monthIndex:date.getMonth() }; }
  function formatTime(timestamp) { const date = new Date(timestamp); return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
})();

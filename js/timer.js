(function () {
  'use strict';

  function createTimerController(storage, onTick, onComplete) {
    let intervalId = null;
    let state = storage.getTimer();

    function normalizeRunningState() {
      state = storage.getTimer();
      if (state.running && state.endAt) {
        const remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
        if (remaining <= 0) {
          finish();
          return;
        }
        state.remainingSec = remaining;
      }
    }

    function notify() {
      normalizeRunningState();
      if (typeof onTick === 'function') onTick({ ...state, taskRef: state.taskRef ? { ...state.taskRef } : null });
    }

    function startLoop() {
      clearInterval(intervalId);
      intervalId = setInterval(() => {
        normalizeRunningState();
        if (!state.running) return;
        if (state.remainingSec <= 0) { finish(); return; }
        if (typeof onTick === 'function') onTick({ ...state, taskRef: state.taskRef ? { ...state.taskRef } : null });
      }, 250);
    }

    function startOrResume() {
      normalizeRunningState();
      if (state.running) return;
      const remaining = state.remainingSec > 0 ? state.remainingSec : state.durationSec;
      state = { ...state, remainingSec: remaining, running: true, endAt: Date.now() + remaining * 1000 };
      storage.setTimer(state);
      startLoop();
      notify();
    }

    function pause() {
      normalizeRunningState();
      if (!state.running) return;
      state = { ...state, running: false, endAt: null };
      storage.setTimer(state);
      clearInterval(intervalId);
      notify();
    }

    function reset() {
      state = storage.getTimer();
      state = { ...state, running: false, endAt: null, remainingSec: state.durationSec };
      storage.setTimer(state);
      clearInterval(intervalId);
      notify();
    }

    function setDuration(seconds) {
      const value = Number(seconds);
      if (![900,1500,1800,2700,3600].includes(value)) return false;
      state = { ...storage.getTimer(), durationSec:value, remainingSec:value, running:false, endAt:null };
      storage.setTimer(state);
      clearInterval(intervalId);
      notify();
      return true;
    }

    function setTaskRef(taskRef) {
      state = { ...storage.getTimer(), taskRef: taskRef || null };
      storage.setTimer(state);
      notify();
    }

    function finish() {
      const before = storage.getTimer();
      const completedState = { ...before, running:false, endAt:null, remainingSec:before.durationSec };
      storage.setTimer(completedState);
      state = completedState;
      clearInterval(intervalId);
      if (typeof onTick === 'function') onTick({ ...state, taskRef: state.taskRef ? { ...state.taskRef } : null });
      if (typeof onComplete === 'function') onComplete(before);
    }

    function init() {
      normalizeRunningState();
      if (state.running) startLoop();
      notify();
      document.addEventListener('visibilitychange', notify);
      window.addEventListener('focus', notify);
    }

    function getState() { normalizeRunningState(); return { ...state, taskRef: state.taskRef ? { ...state.taskRef } : null }; }

    return { init, getState, startOrResume, pause, reset, setDuration, setTaskRef };
  }

  window.PlannerTimer = { createTimerController };
})();

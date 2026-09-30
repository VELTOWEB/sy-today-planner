(function () {
  'use strict';

  const WEEKDAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const WEEKDAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

  function pad(value) { return String(value).padStart(2, '0'); }

  function toLocalDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromDateKey(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function getKoreaDateParts(date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
      }).formatToParts(date);
      const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return { year:Number(map.year), month:Number(map.month), day:Number(map.day), hour:Number(map.hour) };
    } catch (_) {
      return { year:date.getFullYear(), month:date.getMonth()+1, day:date.getDate(), hour:date.getHours() };
    }
  }

  function getTodayKey() {
    const now = getKoreaDateParts();
    return `${now.year}-${pad(now.month)}-${pad(now.day)}`;
  }

  function getKoreaHour() { return getKoreaDateParts().hour; }

  function addDays(dateKey, amount) {
    const date = fromDateKey(dateKey);
    date.setDate(date.getDate() + Number(amount || 0));
    return toLocalDateKey(date);
  }

  function diffDays(aKey, bKey) {
    const a = fromDateKey(aKey);
    const b = fromDateKey(bKey);
    return Math.round((b - a) / 86400000);
  }

  function formatFullKorean(dateKey) {
    const date = fromDateKey(dateKey);
    return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS_KO[date.getDay()]}`;
  }

  function formatShortKorean(dateKey) {
    const date = fromDateKey(dateKey);
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function formatRecordDate(dateKey) {
    const date = fromDateKey(dateKey);
    return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS_SHORT[date.getDay()]}`;
  }

  function getMonthMatrix(year, monthIndex) {
    const first = new Date(year, monthIndex, 1, 12);
    const startOffset = first.getDay();
    const start = new Date(year, monthIndex, 1 - startOffset, 12);
    const days = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push({ dateKey: toLocalDateKey(date), day: date.getDate(), isCurrentMonth: date.getMonth() === monthIndex });
    }
    return days;
  }

  function shiftMonth(year, monthIndex, delta) {
    const date = new Date(year, monthIndex + delta, 1, 12);
    return { year: date.getFullYear(), monthIndex: date.getMonth() };
  }

  function getWeekKeys(anchorKey = getTodayKey()) {
    const anchor = fromDateKey(anchorKey);
    const mondayOffset = anchor.getDay() === 0 ? -6 : 1 - anchor.getDay();
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return toLocalDateKey(date);
    });
  }

  function formatWeekRange(keys) {
    if (!Array.isArray(keys) || !keys.length) return '';
    const first = fromDateKey(keys[0]);
    const last = fromDateKey(keys[keys.length - 1]);
    if (first.getMonth() === last.getMonth()) return `${first.getMonth()+1}.${first.getDate()}–${last.getDate()}`;
    return `${first.getMonth()+1}.${first.getDate()}–${last.getMonth()+1}.${last.getDate()}`;
  }

  function dayOfWeek(dateKey) { return fromDateKey(dateKey).getDay(); }
  function shortWeekday(dateKey) { return WEEKDAYS_SHORT[dayOfWeek(dateKey)]; }
  function isRoutineDue(routine, dateKey) { return Array.isArray(routine?.days) && routine.days.includes(dayOfWeek(dateKey)); }

  window.PlannerCalendar = {
    toLocalDateKey, fromDateKey, getTodayKey, getKoreaHour, addDays, diffDays,
    formatFullKorean, formatShortKorean, formatRecordDate,
    getMonthMatrix, shiftMonth, getWeekKeys, formatWeekRange,
    dayOfWeek, shortWeekday, isRoutineDue
  };
})();

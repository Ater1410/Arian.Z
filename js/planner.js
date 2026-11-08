/* =========================================================
   planner.js — calcula huecos libres y propone sesiones de estudio
   ========================================================= */
(function () {
  'use strict';
  const { DU, SCHOOL_START, SCHOOL_END, classesOn } = window.Agenda;

  function isSchoolDay(state, date) {
    const w = DU.dow(date);
    if (w < 1 || w > 5) return false;
    if (state.settings.noSchoolDates.includes(date)) return false;
    if (state.settings.schoolEnd && date > state.settings.schoolEnd) return false;
    return true;
  }

  function routinesOn(state, date) {
    const w = DU.dow(date);
    return state.routines.filter((r) => r.days.includes(w));
  }

  // Intervalos ocupados del día, en minutos
  function busy(state, date, opts = {}) {
    const out = [];
    if (isSchoolDay(state, date)) out.push([DU.toMin(SCHOOL_START), DU.toMin(SCHOOL_END)]);
    routinesOn(state, date).forEach((r) => out.push([DU.toMin(r.start), DU.toMin(r.end)]));
    state.events.forEach((e) => {
      if (e.date !== date || !e.start || e.id === opts.excludeId) return;
      if (opts.ignoreParent && e.parentId === opts.ignoreParent && !e.done) return;
      const s = DU.toMin(e.start);
      const en = e.end ? DU.toMin(e.end) : s + 30;
      out.push([s, Math.max(en, s + 15)]);
    });
    (opts.extra || []).forEach((x) => out.push(x));
    return out;
  }

  // Ventanas en las que se puede estudiar
  function windows(state, date) {
    const st = state.settings;
    const w = DU.dow(date);
    let wins;
    if (w >= 1 && w <= 5) {
      const routines = routinesOn(state, date);
      let start;
      if (isSchoolDay(state, date)) {
        start = routines.length ? Math.max(...routines.map((r) => DU.toMin(r.end))) : DU.toMin(st.freeDayStart);
        wins = [[start, DU.toMin(st.studyEnd)]];
      } else {
        // feriado entre semana: como fin de semana, pero respetando rutinas
        wins = st.weekendWindows.map(([a, b]) => [DU.toMin(a), DU.toMin(b)]);
      }
    } else {
      wins = st.weekendWindows.map(([a, b]) => [DU.toMin(a), DU.toMin(b)]);
    }
    if (date === DU.today()) {
      const now = Math.ceil((DU.nowMin() + 10) / 5) * 5;
      wins = wins.map(([a, b]) => [Math.max(a, now), b]).filter(([a, b]) => b > a);
    }
    return wins;
  }

  function subtract(wins, busyList) {
    let free = wins.map((w) => w.slice());
    busyList.forEach(([bs, be]) => {
      const next = [];
      free.forEach(([fs, fe]) => {
        if (be <= fs || bs >= fe) { next.push([fs, fe]); return; }
        if (bs > fs) next.push([fs, bs]);
        if (be < fe) next.push([be, fe]);
      });
      free = next;
    });
    return free;
  }

  function freeSlots(state, date, opts = {}) {
    const min = opts.minLen || state.settings.minSlot;
    return subtract(windows(state, date), busy(state, date, opts))
      .filter(([a, b]) => b - a >= min)
      .sort((a, b) => a[0] - b[0]);
  }

  function freeMinutes(state, date, opts = {}) {
    return freeSlots(state, date, opts).reduce((s, [a, b]) => s + (b - a), 0);
  }

  // Índices repartidos de forma uniforme, siempre incluyendo el último
  function spread(n, m) {
    if (n >= m) return [...Array(m).keys()];
    if (n === 1) return [m - 1];
    const set = new Set();
    for (let i = 0; i < n; i++) set.add(Math.round((m - 1) - i * (m - 1) / (n - 1)));
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Propone sesiones de estudio para un examen/tarea.
   * Devuelve { sessions: [{date,start,end,title,minutes}], planned, missing, note }
   */
  function planStudy(state, ev) {
    const total = Math.max(15, ev.estMinutes || 60);
    const diff = ev.difficulty || 3;
    const imp = ev.importance || 3;
    let sessionLen = diff >= 4 ? 50 : diff === 3 ? 45 : 40;
    if (total <= sessionLen + 15) sessionLen = total;
    const maxPerDay = imp >= 4 || diff >= 4 ? 120 : 90;
    const nSessions = Math.ceil(total / sessionLen);

    const today = DU.today();
    const due = ev.date;
    const dueMin = ev.start ? DU.toMin(ev.start) : 23 * 60 + 59;
    // ¿Se puede usar el mismo día de entrega? (solo si hay huecos antes de la hora límite)
    const lastDay = ev.type === 'examen' ? DU.addDays(due, -1) : due;
    const lookback = Math.min(28, Math.max(3, nSessions * 2 + (imp >= 4 ? 2 : 1)));
    let first = DU.addDays(due, -lookback);
    if (first < today) first = today;

    const days = [];
    for (let d = first; d <= lastDay; d = DU.addDays(d, 1)) days.push(d);

    const extra = {};    // ocupación adicional creada por la propia propuesta
    const usedPerDay = {};
    const sessions = [];
    let remaining = total;

    const tryDay = (d) => {
      if (remaining <= 0) return false;
      if ((usedPerDay[d] || 0) >= maxPerDay) return false;
      let len = Math.min(sessionLen, remaining);
      if (remaining - len > 0 && remaining - len < 20) len = remaining; // no dejar restos mini
      len = Math.min(len, maxPerDay - (usedPerDay[d] || 0));
      if (len < 15) return false;
      let slots = freeSlots(state, d, { extra: extra[d] || [], ignoreParent: ev.id, minLen: len });
      if (d === due) slots = slots.map(([a, b]) => [a, Math.min(b, dueMin - 30)]).filter(([a, b]) => b - a >= len);
      if (!slots.length) return false;
      const start = slots[0][0];
      const end = start + len;
      (extra[d] = extra[d] || []).push([start, end + 10]); // 10 min de descanso
      usedPerDay[d] = (usedPerDay[d] || 0) + len;
      sessions.push({ date: d, start: DU.toTime(start), end: DU.toTime(end), minutes: len });
      remaining -= len;
      return true;
    };

    if (days.length) {
      // 1ª pasada: días repartidos
      spread(nSessions, days.length).forEach((i) => tryDay(days[i]));
      // pasadas siguientes: rellenar desde el día más cercano al examen hacia atrás
      for (let pass = 0; pass < 4 && remaining > 0; pass++) {
        for (let i = days.length - 1; i >= 0 && remaining > 0; i--) tryDay(days[i]);
      }
    }

    sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const verb = ev.type === 'examen' ? 'Estudiar' : 'Avanzar';
    sessions.forEach((s, i) => {
      const isLast = i === sessions.length - 1 && sessions.length > 1 && ev.type === 'examen';
      s.title = `${isLast ? 'Repaso' : verb}: ${ev.title}`;
      s.include = true;
    });

    let note = '';
    if (!days.length) note = 'Ya no quedan días antes de la fecha. Puedes agregar sesiones a mano.';
    else if (remaining > 0) note = `Solo encontré ${DU.fmtDur(total - remaining)} de ${DU.fmtDur(total)} en tus horas libres. Considera empezar antes, quitar algo o estudiar en el fin de semana.`;
    return { sessions, planned: total - remaining, missing: Math.max(0, remaining), note };
  }

  /** Propone tiempo de negocio para los próximos 7 días, priorizando el estudio */
  function planBusiness(state, goal) {
    const today = DU.today();
    const target = (goal && goal.target) || 2;
    const sessions = [];
    const exams = state.events.filter((e) => (e.type === 'examen' || e.type === 'tarea') && !e.done);
    const candidates = [];
    for (let i = 0; i < 7; i++) {
      const d = DU.addDays(today, i);
      const w = DU.dow(d);
      const weekend = w === 0 || w === 6 || !isSchoolDay(state, d);
      const examSoon = exams.some((e) => { const n = DU.diffDays(d, e.date); return n >= 0 && n <= 2 && (e.importance || 3) >= 3; });
      const free = freeMinutes(state, d);
      if (weekend && free >= 60) candidates.push({ d, len: 60, weekend, score: 2 + (examSoon ? -1 : 0) });
      else if (!weekend && !examSoon && free >= 90) candidates.push({ d, len: 30, weekend, score: 1 });
    }
    candidates.sort((a, b) => b.score - a.score || a.d.localeCompare(b.d));
    candidates.slice(0, target + 1).forEach(({ d, len, weekend }) => {
      const slots = freeSlots(state, d, { minLen: len });
      if (!slots.length) return;
      let start;
      if (weekend) {
        // Fin de semana: preferir la tarde
        const pm = slots.find(([a, b]) => b - Math.max(a, 15 * 60) >= len);
        start = pm ? Math.max(pm[0], 15 * 60) : slots[0][0];
      } else {
        // Entre semana: al final, después del estudio
        const last = slots[slots.length - 1];
        start = last[1] - len;
      }
      sessions.push({ date: d, start: DU.toTime(start), end: DU.toTime(start + len), minutes: len,
        title: goal ? goal.title : 'Negocio', include: true });
    });
    sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const note = sessions.length ? '' : 'Esta semana está muy llena: no encontré huecos para negocio sin quitarle tiempo al estudio.';
    return { sessions, planned: sessions.reduce((s, x) => s + x.minutes, 0), missing: 0, note };
  }

  window.Planner = { isSchoolDay, routinesOn, busy, windows, freeSlots, freeMinutes, planStudy, planBusiness, classesOn };
})();

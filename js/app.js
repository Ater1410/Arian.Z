/* =========================================================
   app.js — núcleo: estado, calendario, modales, chat, ajustes
   Las vistas "Hoy" y "Metas", el modo concentración, los rituales
   y el recorrido viven en archivos aparte y se conectan vía window.App
   ========================================================= */
(function () {
  'use strict';
  const A = window.Agenda;
  const { DU, SUBJECTS, uid, classesOn } = A;
  const P = window.Planner;
  const AI = window.AI;
  const { icon } = window.Icons;
  const FX = window.FX;

  let state = A.load();
  const ui = {
    view: 'today',
    cursor: DU.today(),
    miniCursor: DU.today(),
    chatBusy: false,
    chatOpen: false,
    unread: false,
    weekScroll: null,
    showDone: false,
    night: false,
  };

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const persist = () => A.save(state);
  const commit = () => { persist(); renderAll(); };
  const dur = (e) => Math.max(0, (DU.toMin(e.end) || 0) - (DU.toMin(e.start) || 0));

  const TYPE = {
    examen: { label: 'Examen', icon: '📝' },
    tarea: { label: 'Tarea', icon: '📚' },
    evento: { label: 'Evento', icon: '📅' },
    estudio: { label: 'Estudio', icon: '🧠' },
    meta: { label: 'Meta', icon: '💡' },
  };
  const IMP = ['', 'Poco importante', 'Algo importante', 'Importante', 'Muy importante', 'Crucial'];
  const DIF = ['', 'Fácil', 'Accesible', 'Media', 'Difícil', 'Muy difícil'];
  const stars = (n) => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
  const G = () => !!state.settings.gameMode;           // modo juego
  const em = (x) => (G() && x ? x + ' ' : '');           // emoji solo en modo juego
  const sdot = (s) => (s ? `<i class="sdot" style="--sc:${s.color}"></i>` : '');

  // ---------- toasts y modales ----------
  function toast(msg, actions = [], ms = 4000) {
    const t = el(`<div class="toast"><span>${esc(msg)}</span></div>`);
    actions.forEach((a) => {
      const b = el(`<button>${esc(a.label)}</button>`);
      b.onclick = () => { a.fn(); t.remove(); };
      t.appendChild(b);
    });
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
  }

  function openModal(html, { wide = false, cls = '', onClose } = {}) {
    const ov = el(`<div class="overlay"><div class="modal ${wide ? 'wide' : ''} ${cls}">${html}</div></div>`);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape' && ov === $('#modalRoot').lastElementChild) close(); };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    $('#modalRoot').appendChild(ov);
    $$('[data-close]', ov).forEach((b) => (b.onclick = close));
    return { root: ov.firstElementChild, close };
  }

  function confirmBox(msg, okLabel = 'Sí', danger = false) {
    return new Promise((resolve) => {
      let answered = false;
      const m = openModal(`
        <div class="modal-body"><p style="margin:0;font-size:15px">${esc(msg)}</p></div>
        <div class="modal-foot"><span class="spacer"></span>
          <button class="btn" data-close>Cancelar</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" id="okBtn">${esc(okLabel)}</button></div>`,
      { onClose: () => { if (!answered) resolve(false); } });
      $('#okBtn', m.root).onclick = () => { answered = true; resolve(true); m.close(); };
    });
  }

  // ---------- tema, color y modo noche ----------
  function isNightTime() {
    const nm = DU.nowMin();
    return state.settings.nightMode && (nm >= DU.toMin(state.settings.bedtime) - 30 || nm < 5 * 60);
  }
  function applyTheme() {
    const st = state.settings;
    ui.night = isNightTime();
    const root = document.documentElement;
    const t = ui.night ? 'dark' : st.theme;
    if (t === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = t;
    root.dataset.accent = st.accent || 'tinta';
    root.dataset.game = G() ? 'on' : 'off';
    FX.fun = G();
    if (ui.night) root.dataset.night = '1'; else root.removeAttribute('data-night');
    const tb = $('#themeBtn');
    if (tb) tb.innerHTML = icon(isDark() ? 'sun' : 'moon');
  }
  function isDark() {
    if (ui.night) return true;
    const t = state.settings.theme;
    if (t === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return t === 'dark';
  }

  // ---------- eventos ----------
  const getEv = (id) => state.events.find((e) => e.id === id);
  const childrenOf = (id) => state.events.filter((e) => e.parentId === id);

  function addEvent(data) {
    const ev = {
      id: uid(), type: 'evento', title: '', subject: null, date: DU.today(), start: '17:00', end: '18:00',
      importance: null, difficulty: null, estMinutes: null, notes: '', done: false, createdAt: Date.now(), ...data,
    };
    if (!ev.end) ev.end = DU.toTime(DU.toMin(ev.start) + 30);
    state.events.push(ev);
    return ev;
  }

  /** Marca hecho/no hecho y celebra si un jefe queda derrotado */
  function markDone(ev, done) {
    const parent = ev.parentId ? getEv(ev.parentId) : null;
    const before = parent ? bossOf(parent).hp : null;
    ev.done = done;
    if (ev.goalId && done) (state.goalLog[ev.goalId] = state.goalLog[ev.goalId] || {})[ev.date] = true;
    if (parent && before > 0 && bossOf(parent).hp === 0) celebrateBoss(parent);
    else if (done && ev.type === 'estudio') FX.chime('ok');
  }

  function addFocus(ev, minutes) {
    const parent = ev.parentId ? getEv(ev.parentId) : (ev.type === 'examen' || ev.type === 'tarea' ? ev : null);
    const before = parent ? bossOf(parent).hp : null;
    ev.focusMinutes = (ev.focusMinutes || 0) + minutes;
    if (parent && before > 0 && bossOf(parent).hp === 0) celebrateBoss(parent);
  }

  function celebrateBoss(parent) {
    const b = bossOf(parent);
    setTimeout(() => {
      FX.confetti(); FX.chime('win');
      toast(G() ? `🏆 ¡Derrotaste al ${b.name}! Estás listo para ${parent.title}` : `Preparación completa para ${parent.title} ✓`, [], 7000);
    }, 150);
  }

  async function deleteEvent(ev, ask = true) {
    const kids = childrenOf(ev.id);
    if (ask) {
      const msg = kids.length ? `¿Eliminar "${ev.title}" y sus ${kids.length} sesiones de estudio?` : `¿Eliminar "${ev.title}"?`;
      if (!(await confirmBox(msg, 'Eliminar', true))) return false;
    }
    const ids = new Set([ev.id, ...kids.map((k) => k.id)]);
    const removed = state.events.filter((e) => ids.has(e.id));
    state.events = state.events.filter((e) => !ids.has(e.id));
    commit();
    toast('Eliminado', [{ label: 'Deshacer', fn: () => { state.events.push(...removed); commit(); } }]);
    return true;
  }

  // ---------- jefes (exámenes como monstruos) ----------
  const TIERS = [
    { max: 6, face: '🐛', name: 'Bichito' },
    { max: 12, face: '👾', name: 'Monstruo' },
    { max: 18, face: '🐲', name: 'Dragón' },
    { max: 99, face: '🐉', name: 'Dragón ancestral' },
  ];
  function bossOf(ev) {
    const power = (ev.importance || 3) * (ev.difficulty || 3);
    const tier = TIERS.find((t) => power <= t.max);
    const kids = childrenOf(ev.id);
    const maxHP = Math.max(30, ev.estMinutes || 60);
    const dmg = kids.reduce((s, k) => s + (k.done ? dur(k) : (k.focusMinutes || 0)), 0) + (ev.focusMinutes || 0);
    const hp = Math.max(0, maxHP - dmg);
    const subj = ev.subject && SUBJECTS[ev.subject];
    return {
      ev, tier, power, maxHP, hp, pct: Math.round(hp / maxHP * 100),
      name: G() ? `${tier.name}${subj ? ' de ' + subj.short : ''}` : (subj ? subj.name : ev.title), face: tier.face, prep: 100 - Math.round(hp / maxHP * 100),
      sessions: kids.length, sessionsDone: kids.filter((k) => k.done).length,
      nextSession: kids.filter((k) => !k.done).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0] || null,
    };
  }
  function activeBosses() {
    const today = DU.today();
    return state.events.filter((e) => (e.type === 'examen' || (e.type === 'tarea' && (e.estMinutes || 0) >= 60)) && !e.done && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)).map(bossOf);
  }

  // ---------- aprendizaje: ¿cuánto tiempo necesitas de verdad? ----------
  const FEEL = { poco: 1.3, justo: 1, sobro: 0.8 };
  function subjectFactor(subject) {
    if (!subject) return null;
    const xs = state.events.filter((e) => e.subject === subject && e.prepFeel && FEEL[e.prepFeel]);
    if (!xs.length) return null;
    const f = xs.reduce((s, e) => s + FEEL[e.prepFeel], 0) / xs.length;
    return { factor: f, n: xs.length };
  }
  function pendingResults() {
    const today = DU.today(), nm = DU.nowMin();
    return state.events.filter((e) => e.type === 'examen' && !e.resultDone
      && (e.date < today || (e.date === today && nm > DU.toMin(e.end || e.start))) && DU.diffDays(e.date, today) <= 21);
  }

  // ---------- metas ----------
  const isDoneGoal = (g, d) => !!(state.goalLog[g.id] && state.goalLog[g.id][d]);
  function setGoal(gid, date, val) {
    const log = (state.goalLog[gid] = state.goalLog[gid] || {});
    if (val) log[date] = true; else delete log[date];
  }
  function toggleGoal(gid, date = DU.today()) {
    const g = state.goals.find((x) => x.id === gid);
    if (!g) return;
    const now = !isDoneGoal(g, date);
    setGoal(gid, date, now);
    commit();
    if (now && date === DU.today()) {
      const s = streakOf(g);
      FX.chime('ok');
      if (s.current > 0 && s.current % 7 === 0) FX.confetti({ count: 90 });
      toast(`${g.icon} ${s.current > 1 ? `Racha de ${s.current} ${g.freq === 'daily' ? 'días' : 'semanas'}` : 'Meta cumplida'}`);
    }
  }
  function weekCount(g, ws) { let c = 0; for (let i = 0; i < 7; i++) if (isDoneGoal(g, DU.addDays(ws, i))) c++; return c; }
  function streakOf(g) {
    const today = DU.today();
    const log = state.goalLog[g.id] || {};
    const dates = Object.keys(log).filter((d) => log[d]).sort();
    if (g.freq === 'daily') {
      let d = isDoneGoal(g, today) ? today : DU.addDays(today, -1);
      let cur = 0;
      while (isDoneGoal(g, d)) { cur++; d = DU.addDays(d, -1); }
      let best = 0, run = 0, prev = null;
      dates.forEach((x) => { run = prev && DU.diffDays(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; });
      return { current: cur, best: Math.max(best, cur), unit: 'días', total: dates.length };
    }
    const target = g.target || 1;
    let ws = DU.startOfWeek(today);
    let cur = weekCount(g, ws) >= target ? 1 : 0;
    ws = DU.addDays(ws, -7);
    while (weekCount(g, ws) >= target) { cur++; ws = DU.addDays(ws, -7); }
    let best = 0, run = 0;
    if (dates.length) {
      for (let w = DU.startOfWeek(dates[0]); w <= DU.startOfWeek(today); w = DU.addDays(w, 7)) {
        run = weekCount(g, w) >= target ? run + 1 : 0;
        best = Math.max(best, run);
      }
    }
    return { current: cur, best: Math.max(best, cur), unit: 'semanas', week: weekCount(g, DU.startOfWeek(today)), total: dates.length };
  }

  // ---------- presentación ----------
  function subjOf(e) { return e.subject && SUBJECTS[e.subject] ? SUBJECTS[e.subject] : null; }
  function shortTitle(e) {
    const s = subjOf(e);
    if (!s) return e.title.replace(/^(Estudiar|Repaso|Avanzar): /, '');
    if (e.type === 'estudio') return `${/^Repaso/.test(e.title) ? 'Repaso' : 'Estudio'} ${s.short}`;
    if (e.type === 'examen') return `Examen ${s.short}`;
    if (e.type === 'tarea') return `Tarea ${s.short}`;
    return e.title;
  }
  function badge(e) {
    const s = subjOf(e);
    if (!G()) return s ? sdot(s) : `<i class="sdot t-${e.type}"></i>`;
    return `${TYPE[e.type] ? TYPE[e.type].icon : ''}${s ? `<span class="sicon">${s.icon}</span>` : ''}`;
  }

  // ---------- Luna: estado de ánimo ----------
  function lunaMood() {
    const nm = DU.nowMin();
    const today = DU.today();
    const bed = DU.toMin(state.settings.bedtime);
    if (ui.chatBusy) return { face: '🤔', text: 'pensando…' };
    if (nm >= bed || nm < 5 * 60) return { face: '😴', text: 'durmiendo… ¡tú también!' };
    const soon = state.events.some((e) => e.type === 'examen' && !e.done && DU.diffDays(today, e.date) >= 0 && DU.diffDays(today, e.date) <= 2);
    const daily = state.goals.filter((g) => g.freq === 'daily');
    if (daily.length && daily.every((g) => isDoneGoal(g, today))) return { face: '🥳', text: '¡cumpliste tus metas de hoy!' };
    if (soon) return { face: '🤓', text: 'modo estudio: examen cerca' };
    if (nm < 12 * 60) return { face: '😊', text: 'buenos días' };
    return { face: '🌙', text: 'aquí estoy' };
  }

  // =========================================================
  //  RENDER
  // =========================================================
  function renderAll() {
    applyTheme();
    renderTopbar();
    renderView();
    renderSidebar();
    renderLuna();
  }

  function renderTopbar() {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === ui.view));
    $('.datenav').classList.toggle('hidden', ui.view === 'goals' || ui.view === 'today');
    let label = '';
    if (ui.view === 'week') {
      const s = DU.startOfWeek(ui.cursor), e = DU.addDays(s, 6);
      const ds = DU.parse(s), de = DU.parse(e);
      label = ds.getMonth() === de.getMonth()
        ? `${ds.getDate()} – ${de.getDate()} de ${DU.MONTHS[de.getMonth()]}`
        : `${ds.getDate()} ${DU.MONTHS[ds.getMonth()].slice(0, 3)} – ${de.getDate()} ${DU.MONTHS[de.getMonth()].slice(0, 3)}`;
    } else if (ui.view === 'month') {
      const d = DU.parse(ui.cursor);
      label = `${DU.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    $('#rangeLabel').textContent = label;
  }

  function renderView() {
    const view = $('#view');
    const prevBody = $('.week-body', view);
    if (prevBody) ui.weekScroll = prevBody.scrollTop;
    view.innerHTML = '';
    view.dataset.view = ui.view;
    let node;
    if (ui.view === 'week') node = renderWeek();
    else if (ui.view === 'month') node = renderMonth();
    else if (ui.view === 'goals') node = App.views.goals();
    else node = App.views.today();
    view.appendChild(node);
    const body = $('.week-body', view);
    if (body) {
      if (ui.weekScroll == null) {
        const sc = makeScale();
        const target = Math.max(sc.c0, DU.nowMin() - 120);
        body.scrollTop = Math.max(0, sc.y(target) - 40);
      } else body.scrollTop = ui.weekScroll;
    }
  }

  // ---------- Escala de tiempo no lineal ----------
  function makeScale() {
    const st = state.settings;
    const c0 = st.calStart * 60, c1 = st.calEnd * 60;
    const bed = Math.min(c1, Math.max(18 * 60 + 30, DU.toMin(st.bedtime)));
    const marks = [[c0, st.expandSchool ? 1.05 : 0.5], [DU.toMin(A.SCHOOL_END), 0.95], [18 * 60, 1.75], [bed, 0.9]];
    const segs = marks.map(([s, p], i) => [s, i < marks.length - 1 ? marks[i + 1][0] : c1, p]).filter(([a, b]) => b > a);
    const y = (m) => { let acc = 0; for (const [a, b, p] of segs) { if (m <= a) break; acc += (Math.min(m, b) - a) * p; } return acc; };
    const inv = (px) => { let acc = 0; for (const [a, b, p] of segs) { const h = (b - a) * p; if (px <= acc + h) return a + (px - acc) / p; acc += h; } return c1; };
    return { y, inv, H: y(c1), c0, c1, bed };
  }

  // ---------- Semana ----------
  function layoutLanes(evs) {
    const items = evs.map((e) => ({ e, s: DU.toMin(e.start), en: Math.max(DU.toMin(e.end || e.start) || 0, DU.toMin(e.start) + 20) }))
      .sort((a, b) => a.s - b.s || b.en - a.en);
    const clusters = [];
    let cur = null;
    items.forEach((it) => {
      if (!cur || it.s >= cur.end) { cur = { items: [], end: it.en, lanes: [] }; clusters.push(cur); }
      cur.end = Math.max(cur.end, it.en);
      let lane = cur.lanes.findIndex((end) => end <= it.s);
      if (lane === -1) { lane = cur.lanes.length; cur.lanes.push(it.en); } else cur.lanes[lane] = it.en;
      it.lane = lane;
      cur.items.push(it);
    });
    clusters.forEach((c) => c.items.forEach((it) => (it.n = c.lanes.length)));
    return items;
  }

  function classActions(c, d) {
    toast(`${em(c.icon)}${c.name} · ${c.teacher} · ${c.start}–${c.end}`, [
      { label: '＋ Examen', fn: () => openEventModal({ type: 'examen', subject: c.subject, date: d, start: c.start, end: c.end }) },
      { label: '＋ Tarea', fn: () => openEventModal({ type: 'tarea', subject: c.subject, date: d, start: c.start, end: DU.toTime(DU.toMin(c.start) + 30) }) },
    ], 6000);
  }

  function renderWeek() {
    const st = state.settings;
    const start = DU.startOfWeek(ui.cursor);
    const days = [...Array(7)].map((_, i) => DU.addDays(start, i));
    const today = DU.today();
    const sc = makeScale();
    const { y } = sc;

    const wrap = el('<div class="week"></div>');
    const head = el(`<div class="week-head"><div class="corner"><button class="icon-btn sm" id="schoolToggle" title="${st.expandSchool ? 'Comprimir el colegio' : 'Expandir el colegio'}">${icon(st.expandSchool ? 'collapse' : 'expand', 16)}</button></div></div>`);
    $('#schoolToggle', head).onclick = () => { st.expandSchool = !st.expandSchool; ui.weekScroll = null; commit(); };
    days.forEach((d) => {
      const w = DU.dow(d);
      const school = P.isSchoolDay(state, d);
      const weekdayNoSchool = w >= 1 && w <= 5 && !school;
      const exams = state.events.filter((e) => e.date === d && e.type === 'examen' && !e.done);
      const hd = el(`<div class="day-head ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" title="Agregar algo el ${DU.pretty(d)}">
        <div class="dn">${DU.DAYS_SHORT[w]}</div><div class="dd">${DU.parse(d).getDate()}</div>
        <div class="dtags">${weekdayNoSchool ? `<span class="noschool">${em('🏖️')}sin clases</span>` : ''}${exams.map((e) => `<span class="examdot" title="${esc(e.title)}">${G() ? (subjOf(e) ? subjOf(e).icon : '📝') : `<i class="sdot t-examen"></i>`}</span>`).join('')}</div>
        ${w >= 1 && w <= 5 ? `<button class="school-toggle" title="${school ? 'Marcar día sin clases (feriado)' : 'Marcar día con clases'}">${school ? '🏫' : '🏖️'}</button>` : ''}
      </div>`);
      const tg = $('.school-toggle', hd);
      if (tg) tg.onclick = (e) => {
        e.stopPropagation();
        const list = st.noSchoolDates;
        const i = list.indexOf(d);
        if (i >= 0) list.splice(i, 1); else list.push(d);
        commit();
        toast(i >= 0 ? `${DU.prettyShort(d)}: con clases` : `${DU.prettyShort(d)}: marcado sin clases 🏖️`);
      };
      hd.addEventListener('click', () => openEventModal({ date: d }));
      head.appendChild(hd);
    });
    wrap.appendChild(head);

    const body = el('<div class="week-body"></div>');
    const grid = el(`<div class="week-grid" style="height:${sc.H}px"></div>`);
    const tcol = el('<div class="time-col"></div>');
    for (let hr = st.calStart + 1; hr <= st.calEnd; hr++) {
      tcol.appendChild(el(`<div class="tl ${hr * 60 >= 18 * 60 && hr * 60 <= sc.bed ? 'prime' : ''}" style="top:${y(hr * 60)}px">${hr}:00</div>`));
    }
    grid.appendChild(tcol);

    days.forEach((d) => {
      const w = DU.dow(d);
      const col = el(`<div class="day-col ${w === 0 || w === 6 ? 'weekend' : ''} ${d === today ? 'is-today' : ''}" data-date="${d}"></div>`);
      for (let hr = st.calStart; hr < st.calEnd; hr++) {
        col.appendChild(el(`<div class="hour-line" style="top:${y(hr * 60)}px"></div>`));
        if (hr >= 18) col.appendChild(el(`<div class="hour-line half" style="top:${y(hr * 60 + 30)}px"></div>`));
      }
      col.appendChild(el(`<div class="prime-zone" style="top:${y(18 * 60)}px;height:${y(sc.bed) - y(18 * 60)}px"></div>`));
      col.appendChild(el(`<div class="night-zone" style="top:${y(sc.bed)}px;height:${sc.H - y(sc.bed)}px"></div>`));

      // huecos libres
      if (d >= today) {
        P.freeSlots(state, d).forEach(([a, b]) => {
          col.appendChild(el(`<div class="free" style="top:${y(a) + 1}px;height:${y(b) - y(a) - 2}px" data-a="${a}" data-b="${b}" title="Libre ${DU.toTime(a)}–${DU.toTime(b)}"><span>＋ libre · ${DU.fmtDur(b - a)}</span></div>`));
        });
      }

      // colegio: cápsula con franjas por materia
      if (P.isSchoolDay(state, d)) {
        const s0 = DU.toMin(A.SCHOOL_START), s1 = DU.toMin(A.SCHOOL_END);
        const cap = el(`<div class="school-cap ${st.expandSchool ? 'open' : ''}" style="top:${y(s0)}px;height:${y(s1) - y(s0)}px"></div>`);
        classesOn(w).forEach((c) => {
          const a = DU.toMin(c.start), b = DU.toMin(c.end);
          const band = el(`<div class="band" style="top:${y(a) - y(s0)}px;height:${y(b) - y(a) - 1}px;--c:${c.color}" title="${esc(c.name)} · ${esc(c.teacher)} · ${c.start}–${c.end}">
            ${G() ? `<span class="bi">${c.icon}</span>` : ''}<span class="bn">${esc(c.short)}</span>${st.expandSchool ? `<span class="bt2">${esc(c.teacher)}</span>` : ''}</div>`);
          band.onclick = (ev) => { ev.stopPropagation(); classActions(c, d); };
          cap.appendChild(band);
        });
        col.appendChild(cap);
      }

      // rutina (discreta)
      P.routinesOn(state, d).forEach((r) => {
        const a = DU.toMin(r.start), b = DU.toMin(r.end);
        col.appendChild(el(`<div class="routine" style="top:${y(a)}px;height:${y(b) - y(a) - 1}px" title="${esc(r.title)} ${r.start}–${r.end}">
          <span>${em(r.icon)}${esc(r.title)}</span></div>`));
      });

      col.appendChild(el(`<div class="bed-line" style="top:${y(sc.bed)}px"><span>🌙</span></div>`));

      // eventos
      const evs = state.events.filter((e) => e.date === d && e.start);
      layoutLanes(evs).forEach(({ e, s, en, lane, n }) => {
        const wpct = 100 / n;
        const h = Math.max(20, y(en) - y(s) - 2);
        const s0 = subjOf(e);
        const boss = e.type === 'examen' && !e.done ? bossOf(e) : null;
        const b = el(`<div class="ev t-${e.type} ${e.done ? 'done' : ''} ${h < 34 ? 'tiny' : ''}" data-id="${e.id}"
          style="top:${y(s)}px;height:${h}px;left:calc(${lane * wpct}% + 4px);width:calc(${wpct}% - 7px);${s0 ? `--sc:${s0.color}` : ''}"
          title="${esc(e.title)} · ${e.start}–${e.end || ''}${e.notes ? '\n' + esc(e.notes) : ''}">
          <div class="bt">${badge(e)} ${esc(shortTitle(e))}</div>
          <div class="bm">${e.start}–${e.end || ''}</div>
          ${boss ? `<div class="mini-hp ${G() ? '' : 'prep'}" title="${G() ? `Vida del jefe ${boss.hp}/${boss.maxHP} min` : `Preparación ${boss.prep}%`}"><i style="width:${G() ? boss.pct : boss.prep}%"></i></div>` : ''}
          ${e.type === 'estudio' && !e.done ? `<button class="play" title="Modo concentración">${icon('play', 12)}</button>` : ''}
          <div class="rz" title="Arrastra para cambiar la duración"></div>
        </div>`);
        const pb = $('.play', b);
        if (pb) {
          pb.addEventListener('pointerdown', (ev) => ev.stopPropagation());
          pb.onclick = (ev) => { ev.stopPropagation(); App.openFocus(e); };
        }
        b.addEventListener('pointerdown', (ev) => startDrag(ev, e, ev.target.classList.contains('rz') ? 'resize' : 'move', b, sc));
        col.appendChild(b);
      });

      if (d === today) {
        const nm = DU.nowMin();
        if (nm > sc.c0 && nm < sc.c1) col.appendChild(el(`<div class="now-line" style="top:${y(nm)}px"></div>`));
      }
      col.addEventListener('pointerdown', (ev) => {
        const t = ev.target;
        if (t !== col && !t.matches('.hour-line, .free, .free span, .prime-zone, .night-zone')) return;
        startCreate(ev, col, d, sc);
      });
      grid.appendChild(col);
    });
    body.appendChild(grid);
    wrap.appendChild(body);
    return wrap;
  }

  // ---------- arrastrar y soltar ----------
  const snap = (m, s = 5) => Math.round(m / s) * s;
  function colAt(x) {
    return $$('.day-col').find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
  }
  function startDrag(e, ev, mode, node, sc) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.pointerType === 'touch') {
      node.addEventListener('pointerup', () => openEventModal({ id: ev.id }), { once: true });
      return;
    }
    e.preventDefault();
    const startY = e.clientY, startX = e.clientX;
    const s0 = DU.toMin(ev.start), e0 = DU.toMin(ev.end || ev.start) || s0 + 30;
    const colRect = node.parentElement.getBoundingClientRect();
    const grab = startY - colRect.top - sc.y(s0);
    let moved = false, ns = s0, ne = e0, nd = ev.date;
    const onMove = (m) => {
      if (!moved && Math.hypot(m.clientX - startX, m.clientY - startY) < 5) return;
      if (!moved) { moved = true; node.classList.add('dragging'); document.body.classList.add('is-dragging'); }
      if (mode === 'move') {
        const col = colAt(m.clientX) || node.parentElement;
        if (col !== node.parentElement) col.appendChild(node);
        nd = col.dataset.date;
        const r = col.getBoundingClientRect();
        ns = Math.max(sc.c0, Math.min(sc.c1 - (e0 - s0), snap(sc.inv(m.clientY - r.top - grab))));
        ne = ns + (e0 - s0);
        node.style.left = '4px'; node.style.width = 'calc(100% - 7px)';
      } else {
        const r = node.parentElement.getBoundingClientRect();
        ne = Math.max(s0 + 15, Math.min(sc.c1, snap(sc.inv(m.clientY - r.top))));
      }
      node.style.top = `${sc.y(ns)}px`;
      node.style.height = `${Math.max(20, sc.y(ne) - sc.y(ns) - 2)}px`;
      $('.bm', node).textContent = `${DU.toTime(ns)}–${DU.toTime(ne)}`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-dragging');
      if (!moved) { openEventModal({ id: ev.id }); return; }
      const before = { date: ev.date, start: ev.start, end: ev.end };
      Object.assign(ev, { date: nd, start: DU.toTime(ns), end: DU.toTime(ne) });
      commit();
      const conflict = P.busy(state, nd, { excludeId: ev.id }).some(([a, b]) => ns < b && ne > a);
      toast(`${mode === 'move' ? 'Movido' : 'Ajustado'}: ${DU.prettyShort(nd)} ${ev.start}–${ev.end}${conflict ? ' ⚠️ choca con algo' : ''}`,
        [{ label: 'Deshacer', fn: () => { Object.assign(ev, before); commit(); } }]);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startCreate(e, col, d, sc) {
    if (e.button !== 0) return;
    const r = col.getBoundingClientRect();
    const freeEl = e.target.closest('.free');
    const m0 = snap(sc.inv(e.clientY - r.top), 15);
    const clickCreate = () => {
      if (freeEl) {
        const a = +freeEl.dataset.a, b = +freeEl.dataset.b;
        const st = Math.max(a, Math.min(m0, b - 30));
        openEventModal({ date: d, type: 'evento', start: DU.toTime(st), end: DU.toTime(Math.min(b, st + 60)) });
      } else openEventModal({ date: d, type: 'evento', start: DU.toTime(m0), end: DU.toTime(m0 + 60) });
    };
    if (e.pointerType === 'touch') { col.addEventListener('pointerup', clickCreate, { once: true }); return; }
    e.preventDefault();
    let ghost = null, m1 = m0;
    const onMove = (m) => {
      m1 = snap(sc.inv(m.clientY - r.top), 15);
      if (!ghost && Math.abs(m1 - m0) < 15) return;
      if (!ghost) { ghost = el('<div class="drag-ghost"></div>'); col.appendChild(ghost); document.body.classList.add('is-dragging'); }
      const a = Math.min(m0, m1), b = Math.max(m0, m1);
      ghost.style.top = `${sc.y(a)}px`; ghost.style.height = `${sc.y(b) - sc.y(a)}px`;
      ghost.textContent = `${DU.toTime(a)}–${DU.toTime(b)}`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-dragging');
      if (!ghost) { clickCreate(); return; }
      ghost.remove();
      const a = Math.min(m0, m1), b = Math.max(m0, m1);
      openEventModal({ date: d, type: 'evento', start: DU.toTime(a), end: DU.toTime(Math.max(b, a + 15)) });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------- Mes ----------
  function renderMonth() {
    const cur = DU.parse(ui.cursor);
    const first = DU.fmt(new Date(cur.getFullYear(), cur.getMonth(), 1));
    const start = DU.startOfWeek(first);
    const today = DU.today();
    const wrap = el('<div class="month"></div>');
    const grid = el('<div class="month-grid"></div>');
    ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach((d) => grid.appendChild(el(`<div class="month-dow">${d}</div>`)));
    const order = { examen: 0, tarea: 1, evento: 2, meta: 3, estudio: 4 };
    for (let i = 0; i < 42; i++) {
      const d = DU.addDays(start, i);
      const dd = DU.parse(d);
      const evs = state.events.filter((e) => e.date === d)
        .sort((a, b) => order[a.type] - order[b.type] || (a.start || '').localeCompare(b.start || ''));
      const w = dd.getDay();
      const noSchool = w >= 1 && w <= 5 && !P.isSchoolDay(state, d);
      const cell = el(`<div class="mcell ${dd.getMonth() !== cur.getMonth() ? 'other' : ''} ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}">
        <div class="mn"><span>${dd.getDate()}</span>${noSchool ? '<small>🏖️</small>' : ''}</div>
        ${evs.slice(0, 3).map((e) => `<div class="chip t-${e.type} ${e.done ? 'done' : ''}" title="${esc(e.title)}">${badge(e)} ${esc(shortTitle(e))}</div>`).join('')}
        ${evs.length > 3 ? `<div class="more">+${evs.length - 3} más</div>` : ''}
      </div>`);
      cell.onclick = () => { ui.cursor = d; ui.view = 'week'; ui.weekScroll = null; renderAll(); };
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  // ---------- Lateral ----------
  function renderMiniMonth() {
    const box = $('#miniMonth');
    const cur = DU.parse(ui.miniCursor);
    const first = DU.fmt(new Date(cur.getFullYear(), cur.getMonth(), 1));
    const start = DU.startOfWeek(first);
    const today = DU.today();
    const wk = DU.startOfWeek(ui.cursor);
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = DU.addDays(start, i);
      const dd = DU.parse(d);
      const evs = state.events.filter((e) => e.date === d && !e.done && (e.type === 'examen' || e.type === 'tarea'));
      const inWeek = ui.view === 'week' && d >= wk && d <= DU.addDays(wk, 6);
      cells += `<button class="mm ${dd.getMonth() !== cur.getMonth() ? 'other' : ''} ${d === today ? 'today' : ''} ${inWeek ? 'inweek' : ''}" data-d="${d}" title="${DU.pretty(d)}${evs.length ? ' · ' + esc(evs.map((e) => e.title).join(', ')) : ''}">${dd.getDate()}${evs.length ? `<i class="${evs.some((e) => e.type === 'examen') ? 'ex' : 'ta'}"></i>` : ''}</button>`;
    }
    box.innerHTML = `<div class="mm-head"><button class="icon-btn sm" data-m="-1">${icon('left', 14)}</button>
      <b>${DU.MONTHS[cur.getMonth()]} ${cur.getFullYear()}</b><button class="icon-btn sm" data-m="1">${icon('right', 14)}</button></div>
      <div class="mm-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}${cells}</div>`;
    $$('[data-m]', box).forEach((b) => (b.onclick = () => { ui.miniCursor = DU.fmt(new Date(cur.getFullYear(), cur.getMonth() + +b.dataset.m, 1)); renderMiniMonth(); }));
    $$('.mm', box).forEach((b) => (b.onclick = () => { ui.cursor = b.dataset.d; ui.view = 'week'; ui.weekScroll = null; renderAll(); }));
  }

  function renderSidebar() {
    renderMiniMonth();
    const today = DU.today();
    const tg = $('#todayGoals');
    tg.innerHTML = '';
    state.goals.forEach((g) => {
      const done = isDoneGoal(g, today);
      const st = streakOf(g);
      const row = el(`<div class="goal-row ${done ? 'done' : ''}"><span class="check">${done ? icon('check', 13) : ''}</span><span class="gi">${esc(g.icon)}</span>
        <span class="gt">${esc(g.title)}</span><span class="gs">${g.freq === 'weekly' ? `${st.week}/${g.target}` : `🔥${st.current}`}</span></div>`);
      row.onclick = () => toggleGoal(g.id, today);
      tg.appendChild(row);
    });
    if (!state.goals.length) tg.innerHTML = '<div class="empty">Sin metas. Crea una en "Metas".</div>';

    const up = $('#upcoming');
    up.innerHTML = '';
    const horizon = DU.addDays(today, 30);
    const list = state.events.filter((e) => ['examen', 'tarea', 'evento', 'meta'].includes(e.type)
      && (ui.showDone || !e.done)
      && ((e.date >= today && e.date <= horizon) || (e.type === 'tarea' && !e.done && e.date < today && DU.diffDays(e.date, today) <= 14)))
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))
      .slice(0, 12);
    if (!list.length) up.innerHTML = '<div class="empty">Nada pendiente 🎉<br>Escribe abajo "examen de…"</div>';
    list.forEach((e) => {
      const n = DU.diffDays(today, e.date);
      const cls = n <= 1 ? 'hot' : n <= 3 ? 'warm' : '';
      const kids = childrenOf(e.id);
      const needsPlan = (e.type === 'examen' || e.type === 'tarea') && !e.done && !kids.length && e.estMinutes;
      const s = subjOf(e);
      const boss = (e.type === 'examen' || e.type === 'tarea') && !e.done && e.estMinutes ? bossOf(e) : null;
      const item = el(`<div class="up-item ${e.done ? 'done' : ''}" style="--sc:${s ? s.color : 'var(--accent)'}">
        ${G() ? `<div class="up-icon">${s ? s.icon : TYPE[e.type].icon}</div>` : `<i class="sdot big ${s ? '' : 't-' + e.type}" ${s ? `style="--sc:${s.color}"` : ''}></i>`}
        <div style="min-width:0;flex:1">
          <div class="ut">${esc(shortTitle(e))}</div>
          <div class="um">${DU.prettyShort(e.date)} · ${e.start || ''}${e.importance ? ` · <span class="dots" title="Importancia ${e.importance}/5">${stars(e.importance)}</span>` : ''}</div>
          ${boss ? (G() ? `<div class="hp-row" title="Vida del jefe: ${boss.hp} de ${boss.maxHP} min"><span>${boss.face}</span><div class="hp"><i style="width:${boss.pct}%"></i></div><small>${boss.pct}%</small></div>`
            : `<div class="hp-row" title="Preparación ${boss.prep}%"><div class="hp prep"><i style="width:${boss.prep}%"></i></div><small>${boss.prep}%</small></div>`) : ''}
          ${needsPlan ? '<button class="link" data-plan>Proponer plan de estudio</button>' : ''}
        </div>
        <span class="when ${cls}">${n < 0 ? 'atrasada' : DU.relative(e.date)}</span>
      </div>`);
      item.onclick = () => openEventModal({ id: e.id });
      const pb = $('[data-plan]', item);
      if (pb) pb.onclick = (ev) => { ev.stopPropagation(); openPlanModal(e); };
      up.appendChild(item);
    });
  }

  function summaryText() {
    const s = state.summary;
    return s && s.date === DU.today() ? s.text : AI.localSummary(state);
  }
  async function refreshSummary(force = false) {
    const today = DU.today();
    if (!force && state.summary && state.summary.date === today) return;
    if (!state.settings.geminiKey) { state.summary = null; return; }
    try {
      const text = await AI.dailySummaryAI(state);
      if (text) { state.summary = { date: today, text }; persist(); const box = $('#lunaSays'); if (box) box.textContent = text; }
    } catch (e) { if (force) toast(e.message); }
  }

  // =========================================================
  //  Preguntas: importancia / dificultad / tiempo
  // =========================================================
  function questionsHTML(v) {
    const type = v.kind || v.type;
    const timeOpts = type === 'evento' ? [30, 60, 90, 120, 180, 240] : [30, 60, 90, 120, 180, 240, 360];
    const tLabel = type === 'evento' ? '¿Cuánto tiempo te ocupará ese día?' : type === 'tarea' ? '¿Cuánto tiempo te costará hacerla?' : '¿Cuánto tiempo necesitas para prepararlo?';
    const custom = v.estMinutes && !timeOpts.includes(v.estMinutes) ? String(+(v.estMinutes / 60).toFixed(2)) : '';
    const sf = (type === 'examen' || type === 'tarea') ? subjectFactor(v.subject) : null;
    let learn = '';
    if (sf && Math.abs(sf.factor - 1) >= 0.08) {
      const pct = Math.round(Math.abs(sf.factor - 1) * 100);
      const s = SUBJECTS[v.subject];
      const sug = v.estMinutes ? Math.max(15, Math.round(v.estMinutes * sf.factor / 15) * 15) : null;
      learn = `<div class="learn">🧠 Según tus exámenes anteriores, en ${esc(s.name)} sueles necesitar <b>${pct}% ${sf.factor > 1 ? 'más' : 'menos'}</b> tiempo del que calculas.
        ${sug && sug !== v.estMinutes ? `<button type="button" class="link" data-sug="${sug}">Usar ${DU.fmtDur(sug)}</button>` : ''}</div>`;
    }
    const faces = ['', '😌', '🙂', '😐', '😬', '😱'];
    return `<div class="questions">
      <div class="qh">Cuéntame un poco más ${v.estimated ? '<small>(Luna lo estimó — ajústalo si no es así)</small>' : ''}</div>
      <div class="q" data-q="importance"><label>¿Qué tan importante es?<em>${IMP[v.importance] || ''}</em></label>
        <div class="scale imp ${G() ? 'game' : ''}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" class="${v.importance === n ? 'sel' : ''} ${v.importance >= n ? 'fill' : ''}" title="${IMP[n]}">${G() ? '★' : n}</button>`).join('')}</div></div>
      <div class="q" data-q="difficulty"><label>¿Qué tan difícil es para ti?<em>${DIF[v.difficulty] || ''}</em></label>
        <div class="scale diff ${G() ? 'game' : ''}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" class="${v.difficulty === n ? 'sel' : ''}" title="${DIF[n]}">${G() ? faces[n] : n}</button>`).join('')}</div></div>
      <div class="q" data-q="estMinutes"><label>${tLabel}<em>${v.estMinutes ? DU.fmtDur(v.estMinutes) : ''}</em></label>
        <div class="timechips">${timeOpts.map((n) => `<button type="button" data-v="${n}" class="${v.estMinutes === n ? 'sel' : ''}">${DU.fmtDur(n)}</button>`).join('')}
        <input type="number" min="0.25" step="0.25" placeholder="otro (h)" value="${custom}" title="Horas"></div>${learn}</div>
    </div>`;
  }

  function bindQuestions(root, v, onChange) {
    const q = $('.questions', root);
    if (!q) return;
    const rerender = () => { q.replaceWith(el(questionsHTML(v))); bindQuestions(root, v, onChange); };
    $$('.q', q).forEach((box) => {
      const key = box.dataset.q;
      $$('button[data-v]', box).forEach((b) => (b.onclick = () => {
        v[key] = +b.dataset.v; v.estimated = false; onChange && onChange(key); rerender();
      }));
      const sug = $('[data-sug]', box);
      if (sug) sug.onclick = () => { v.estMinutes = +sug.dataset.sug; onChange && onChange('estMinutes'); rerender(); };
      const inp = $('input', box);
      if (inp) inp.onchange = () => {
        const hrs = parseFloat(inp.value);
        if (hrs > 0) { v[key] = Math.round(hrs * 60); v.estimated = false; onChange && onChange(key); rerender(); }
      };
    });
  }

  function missingQuestions(v) {
    const type = v.kind || v.type;
    if (type !== 'examen' && type !== 'tarea') return [];
    return ['importance', 'difficulty', 'estMinutes'].filter((k) => !v[k]);
  }

  // ---------- resultado de un examen ----------
  function resultHTML(v) {
    const scale = state.settings.gradeScale || 20;
    return `<div class="result-box">
      <div class="qh">🎯 ¿Cómo te fue?</div>
      <div class="row">
        <label class="field" style="flex:0 0 120px"><span>Nota (sobre ${scale})</span><input type="number" class="r-grade" min="0" max="${scale}" step="0.5" value="${v.grade != null ? v.grade : ''}" placeholder="—"></label>
        <div class="field"><span>El tiempo que estudiaste fue…</span>
          <div class="feel">${[['poco', '😰 Poco'], ['justo', '👌 Justo'], ['sobro', '😎 Me sobró']].map(([k, l]) => `<button type="button" data-f="${k}" class="${v.prepFeel === k ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      </div></div>`;
  }
  function bindResult(root, v) {
    $$('.feel button', root).forEach((b) => (b.onclick = () => {
      v.prepFeel = b.dataset.f;
      $$('.feel button', root).forEach((x) => x.classList.toggle('sel', x === b));
    }));
    const g = $('.r-grade', root);
    g.oninput = () => { v.grade = g.value === '' ? null : +g.value; };
  }
  function saveResult(ev, v) {
    if (v.grade == null && !v.prepFeel) return false;
    ev.grade = v.grade; ev.prepFeel = v.prepFeel; ev.resultDone = true; ev.done = true;
    const scale = state.settings.gradeScale || 20;
    if (v.grade != null && v.grade >= scale * 0.85) { FX.confetti({ count: 120 }); FX.chime('win'); }
    return true;
  }

  // =========================================================
  //  Modal de evento
  // =========================================================
  function openEventModal(init = {}, opts = {}) {
    const editing = init.id ? getEv(init.id) : null;
    const v = editing ? { ...editing } : {
      type: 'examen', title: '', subject: null, date: DU.today(),
      start: '', end: '', importance: null, difficulty: null, estMinutes: null, notes: '', ...init,
    };
    let titleTouched = !!v.title;
    let timeTouched = !!init.start || !!editing;
    const isPastExam = !!editing && editing.type === 'examen' && (editing.resultDone || pendingResults().includes(editing));

    const subjOptions = `<option value="">— Ninguna —</option>` +
      Object.entries(SUBJECTS).map(([k, s]) => `<option value="${k}">${em(s.icon)}${esc(s.name)}</option>`).join('');

    const m = openModal(`
      <div class="modal-head"><h2>${editing ? 'Editar' : 'Nuevo'}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="modal-body">
        <div class="type-chips">${Object.entries(TYPE).map(([k, t]) => `<button type="button" data-t="${k}" class="t-${k}">${em(t.icon)}${t.label}</button>`).join('')}</div>
        <label class="field"><span>Título</span><input type="text" id="fTitle" placeholder="Ej: Examen de Matemática – derivadas"></label>
        <div class="row">
          <label class="field"><span>Materia</span><select id="fSubject">${subjOptions}</select></label>
          <label class="field"><span>Fecha</span><input type="date" id="fDate"></label>
        </div>
        <div class="row">
          <label class="field"><span id="lblStart">Hora</span><input type="time" id="fStart"></label>
          <label class="field"><span>Hasta</span><input type="time" id="fEnd"></label>
        </div>
        <div id="timeHint" class="hint"></div>
        <div id="qWrap"></div>
        <label class="field"><span>Notas / temas <small>(sepáralos con comas: serán tu lista en el modo concentración)</small></span><textarea id="fNotes" rows="2" placeholder="Ej: derivadas, regla de la cadena, límites"></textarea></label>
        ${isPastExam ? resultHTML(v) : ''}
        ${editing && editing.parentId && getEv(editing.parentId) ? `<div class="callout">🧠 Sesión del plan de <b>${esc(getEv(editing.parentId).title)}</b></div>` : ''}
      </div>
      <div class="modal-foot">
        ${editing ? `<button class="btn danger icon-only" id="fDel" title="Eliminar">${icon('trash', 16)}</button>` : ''}
        ${editing ? `<button class="btn" id="fDone">${editing.done ? '↩ No hecho' : '✓ Hecho'}</button>` : ''}
        ${editing && editing.type === 'estudio' && !editing.done ? `<button class="btn" id="fFocus">${icon('play', 14)} Concentrarme</button>` : ''}
        <span class="spacer"></span>
        <button class="btn" data-close>Cancelar</button>
        <button class="btn" id="fSave">Guardar</button>
        <button class="btn primary" id="fSavePlan">Guardar y planificar</button>
      </div>`);
    const r = m.root;
    const f = { title: $('#fTitle', r), subject: $('#fSubject', r), date: $('#fDate', r), start: $('#fStart', r), end: $('#fEnd', r), notes: $('#fNotes', r) };
    f.title.value = v.title || '';
    f.subject.value = v.subject || '';
    f.date.value = v.date || DU.today();
    f.start.value = v.start || '';
    f.end.value = v.end || '';
    f.notes.value = v.notes || '';
    if (isPastExam) bindResult(r, v);

    const autoTitle = () => {
      if (titleTouched) return;
      const s = v.subject && SUBJECTS[v.subject];
      f.title.value = s && v.type !== 'evento' ? `${TYPE[v.type].label} de ${s.name}` : '';
    };
    const autoTime = () => {
      const hint = $('#timeHint', r);
      hint.textContent = ''; hint.className = 'hint';
      if (!v.date) return;
      const cls = v.subject ? classesOn(DU.dow(v.date)).find((c) => c.subject === v.subject) : null;
      if (!timeTouched) {
        if (v.type === 'examen') { v.start = cls ? cls.start : '08:00'; v.end = cls ? cls.end : '09:00'; }
        else if (v.type === 'tarea') { v.start = cls ? cls.start : '07:45'; v.end = DU.toTime(DU.toMin(v.start) + 30); }
        else if (!v.start) { v.start = '17:00'; v.end = '18:00'; }
        f.start.value = v.start; f.end.value = v.end;
      }
      if (v.subject && (v.type === 'examen' || v.type === 'tarea')) {
        if (cls) hint.textContent = `Ese día tienes ${SUBJECTS[v.subject].name} de ${cls.start} a ${cls.end}.`;
        else { hint.textContent = `No tienes ${SUBJECTS[v.subject].name} el ${DU.pretty(v.date)}. Revisa la fecha.`; hint.className = 'hint warn'; }
      }
    };
    const syncType = () => {
      $$('.type-chips button', r).forEach((b) => b.classList.toggle('sel', b.dataset.t === v.type));
      $('#lblStart', r).textContent = v.type === 'tarea' ? 'Hora de entrega' : 'Hora';
      const wq = $('#qWrap', r);
      if (['examen', 'tarea', 'evento'].includes(v.type) && !isPastExam) {
        wq.innerHTML = questionsHTML(v);
        bindQuestions(wq, v, (key) => {
          if (key === 'estMinutes' && v.type === 'evento' && f.start.value) f.end.value = DU.toTime(DU.toMin(f.start.value) + v.estMinutes);
        });
      } else wq.innerHTML = '';
      const planable = (v.type === 'examen' || v.type === 'tarea') && !isPastExam;
      $('#fSavePlan', r).style.display = planable ? '' : 'none';
      $('#fSave', r).classList.toggle('primary', !planable);
      if (editing && planable && childrenOf(editing.id).length) $('#fSavePlan', r).textContent = 'Guardar y rehacer plan';
    };

    $$('.type-chips button', r).forEach((b) => (b.onclick = () => { v.type = b.dataset.t; autoTitle(); autoTime(); syncType(); }));
    f.title.oninput = () => { titleTouched = !!f.title.value.trim(); };
    f.subject.onchange = () => { v.subject = f.subject.value || null; autoTitle(); autoTime(); syncType(); };
    f.date.onchange = () => { v.date = f.date.value; autoTime(); };
    f.start.onchange = () => {
      timeTouched = true;
      const d0 = (DU.toMin(v.end) || 0) - (DU.toMin(v.start) || 0);
      v.start = f.start.value;
      if (v.start) { v.end = DU.toTime(DU.toMin(v.start) + (d0 > 0 ? d0 : 60)); f.end.value = v.end; }
    };
    f.end.onchange = () => { timeTouched = true; v.end = f.end.value; };

    syncType();
    if (!editing) { autoTitle(); autoTime(); }
    setTimeout(() => (editing || init.subject || init.title ? null : f.title.focus()), 50);

    const doSave = (plan) => {
      v.title = f.title.value.trim();
      v.date = f.date.value; v.start = f.start.value; v.end = f.end.value; v.notes = f.notes.value.trim();
      if (!v.title) { const s = v.subject && SUBJECTS[v.subject]; v.title = s ? `${TYPE[v.type].label} de ${s.name}` : ''; }
      if (!v.title) { f.title.focus(); toast('Ponle un título 🙂'); return; }
      if (!v.date) { f.date.focus(); return; }
      if (!v.start) { f.start.focus(); toast('Elige una hora'); return; }
      if (!v.end || DU.toMin(v.end) <= DU.toMin(v.start)) v.end = DU.toTime(DU.toMin(v.start) + 30);
      const miss = isPastExam ? [] : missingQuestions(v);
      if (miss.length) {
        miss.forEach((k) => { const q = $(`.q[data-q=${k}]`, r); q && q.classList.add('missing'); });
        toast('Responde las 3 preguntas 👇 así puedo planificar mejor');
        $('.questions', r).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      delete v.estimated;
      let ev;
      if (editing) {
        const res = { grade: v.grade, prepFeel: v.prepFeel };
        Object.assign(editing, v); ev = editing;
        if (isPastExam) saveResult(ev, res);
      } else ev = addEvent(v);
      m.close();
      commit();
      opts.onSaved && opts.onSaved(ev);
      if (plan) openPlanModal(ev);
      else if (!editing) {
        const acts = (ev.type === 'examen' || ev.type === 'tarea') ? [{ label: 'Planificar estudio', fn: () => openPlanModal(ev) }] : [];
        toast(`Guardado: ${ev.title}`, acts, 6000);
      }
    };
    $('#fSave', r).onclick = () => doSave(false);
    $('#fSavePlan', r).onclick = () => doSave(true);
    if (editing) {
      $('#fDel', r).onclick = async () => { m.close(); await deleteEvent(editing); };
      $('#fDone', r).onclick = () => { markDone(editing, !editing.done); m.close(); commit(); };
      const fb = $('#fFocus', r);
      if (fb) fb.onclick = () => { m.close(); App.openFocus(editing); };
    }
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSave(false); });
  }

  // =========================================================
  //  Modal de plan propuesto (el estudiante aprueba)
  // =========================================================
  function openPlanModal(ev, { goal } = {}) {
    const isBiz = !!goal;
    const today = DU.today();
    let result = isBiz ? P.planBusiness(state, goal) : P.planStudy(state, ev);
    let sessions = result.sessions.map((s) => ({ ...s }));
    const existing = isBiz ? [] : childrenOf(ev.id).filter((k) => !k.done && k.date >= today);
    const boss = isBiz ? null : bossOf(ev);

    const m = openModal(`
      <div class="modal-head"><h2>${isBiz ? 'Tiempo para tu negocio' : G() ? `${boss.face} Plan de batalla` : 'Plan de estudio'}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="modal-body">
        <div id="planInfo"></div>
        <div class="plan-list" id="planList"></div>
        <div><button class="btn sm" id="addRow">${icon('plus', 14)} Agregar sesión</button></div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="recalc">${icon('refresh', 14)} Recalcular</button>
        <span class="spacer"></span>
        <button class="btn" data-close>Ahora no</button>
        <button class="btn primary" id="approve">Aprobar</button>
      </div>`, { wide: true });
    const r = m.root;

    const conflict = (s) => {
      const busy = P.busy(state, s.date, isBiz ? {} : { ignoreParent: ev.id });
      const a = DU.toMin(s.start), b = DU.toMin(s.end);
      const others = sessions.filter((x) => x !== s && x.include && x.date === s.date).map((x) => [DU.toMin(x.start), DU.toMin(x.end)]);
      if ([...busy, ...others].some(([x, y]) => a < y && b > x)) return '⚠️ Choca con otra actividad';
      if (b > DU.toMin(state.settings.bedtime)) return '🌙 Pasa tu hora de dormir';
      return '';
    };

    const render = () => {
      const inc = sessions.filter((s) => s.include);
      const total = inc.reduce((a, s) => a + (DU.toMin(s.end) - DU.toMin(s.start)), 0);
      let info;
      if (isBiz) {
        info = `<div class="callout">Bloques para <b>${esc(goal.title)}</b> en los próximos 7 días, solo en huecos que no le quitan tiempo al estudio. Total: <b>${DU.fmtDur(total)}</b>.</div>`;
      } else {
        const left = Math.max(0, boss.hp - total);
        info = `<div class="boss-banner">${G() ? `<span class="bf">${boss.face}</span>` : ''}<div style="flex:1"><b>${esc(G() ? boss.name : ev.title)}</b> · ${DU.pretty(ev.date)} ${ev.start || ''}<br>
          <small>Tiempo estimado ${DU.fmtDur(boss.maxHP)} · Importancia ${ev.importance || '?'}/5 · Dificultad ${ev.difficulty || '?'}/5</small>
          <div class="hp big ${G() ? '' : 'prep'}"><i style="width:${G() ? Math.round(left / boss.maxHP * 100) : 100 - Math.round(left / boss.maxHP * 100)}%"></i></div>
          <small>${G() ? (left === 0 ? `Con estas ${inc.length} sesiones (${DU.fmtDur(total)}) lo derrotas antes del examen ⚔️` : `Con estas sesiones le quitas ${DU.fmtDur(boss.hp - left)}; le quedarían ${DU.fmtDur(left)} de vida`) : (left === 0 ? `${inc.length} sesiones · ${DU.fmtDur(total)}: llegas 100% preparado` : `${inc.length} sesiones · ${DU.fmtDur(total)}: llegarías ${100 - Math.round(left / boss.maxHP * 100)}% preparado`)}.</small></div></div>`;
        if (existing.length) info += `<div class="callout warn">Al aprobar se reemplazan las ${existing.length} sesiones pendientes que ya tenías.</div>`;
      }
      if (result.note) info += `<div class="callout warn">${esc(result.note)}</div>`;
      $('#planInfo', r).innerHTML = info;

      const list = $('#planList', r);
      list.innerHTML = '';
      if (!sessions.length) list.innerHTML = '<div class="empty">No hay sesiones propuestas. Agrega una a mano.</div>';
      sessions.forEach((s) => {
        const c = conflict(s);
        const row = el(`<div class="plan-row ${s.include ? '' : 'off'}">
          <input type="checkbox" ${s.include ? 'checked' : ''} title="Incluir">
          <input type="date" value="${s.date}" min="${today}">
          <input type="time" value="${s.start}">
          <input type="time" value="${s.end}">
          <div class="pdesc"><div class="pt">${esc(s.title)}</div><div class="pd">${DU.prettyShort(s.date)} · ${DU.fmtDur(DU.toMin(s.end) - DU.toMin(s.start))} ${c ? '· ' + c : ''}</div></div>
        </div>`);
        const [chk, di, si, ei] = $$('input', row);
        chk.onchange = () => { s.include = chk.checked; render(); };
        di.onchange = () => { s.date = di.value; render(); };
        si.onchange = () => { const d0 = DU.toMin(s.end) - DU.toMin(s.start); s.start = si.value; s.end = DU.toTime(DU.toMin(si.value) + d0); render(); };
        ei.onchange = () => { if (DU.toMin(ei.value) > DU.toMin(s.start)) s.end = ei.value; render(); };
        list.appendChild(row);
      });
      $('#approve', r).textContent = `Aprobar (${inc.length})`;
      $('#approve', r).disabled = !inc.length && !existing.length;
    };
    render();

    $('#recalc', r).onclick = () => {
      result = isBiz ? P.planBusiness(state, goal) : P.planStudy(state, ev);
      sessions = result.sessions.map((s) => ({ ...s }));
      render();
    };
    $('#addRow', r).onclick = () => {
      let d = today, slot = null;
      for (let i = 0; i < 14 && !slot; i++) {
        d = DU.addDays(today, i);
        if (!isBiz && d > ev.date) break;
        slot = P.freeSlots(state, d, { minLen: 30, ignoreParent: isBiz ? undefined : ev.id })[0];
      }
      const s0 = slot ? slot[0] : 17 * 60;
      sessions.push({ date: d, start: DU.toTime(s0), end: DU.toTime(s0 + 45), include: true, title: isBiz ? goal.title : `Estudiar: ${ev.title}` });
      render();
    };
    $('#approve', r).onclick = () => {
      const inc = sessions.filter((s) => s.include);
      if (existing.length) { const ids = new Set(existing.map((e) => e.id)); state.events = state.events.filter((e) => !ids.has(e.id)); }
      inc.forEach((s) => addEvent({
        type: isBiz ? 'meta' : 'estudio', title: s.title, date: s.date, start: s.start, end: s.end,
        subject: isBiz ? null : ev.subject, parentId: isBiz ? null : ev.id, goalId: isBiz ? goal.id : null,
        estMinutes: DU.toMin(s.end) - DU.toMin(s.start),
      }));
      m.close();
      commit();
      FX.chime('ok');
      toast(`${inc.length} ${inc.length === 1 ? 'sesión agregada' : 'sesiones agregadas'} al calendario`,
        inc.length ? [{ label: 'Ver semana', fn: () => { ui.view = 'week'; ui.cursor = inc[0].date; ui.weekScroll = null; renderAll(); } }] : [], 6000);
    };
  }

  // =========================================================
  //  Barra rápida (escribir o dictar)
  // =========================================================
  function setupQuickbar() {
    const input = $('#quickInput');
    const prev = $('#quickPreview');
    let parsed = null;
    const update = () => {
      parsed = AI.quickParse(state, input.value);
      if (!input.value.trim()) { prev.innerHTML = '<span class="qp-hint">Ej: <i>examen de física el miércoles</i> · <i>tarea de inglés para el 20/11</i> · <i>cumpleaños de Sofi el sábado a las 5</i></span>'; return; }
      if (!parsed) {
        prev.innerHTML = state.settings.geminiKey ? '<span class="qp-hint">↵ Enter para preguntarle a Luna ✨</span>' : '<span class="qp-hint">Sigue escribiendo… (menciona examen, tarea, cita, cumpleaños…)</span>';
        return;
      }
      const s = parsed.subject && SUBJECTS[parsed.subject];
      prev.innerHTML = `<span class="qchip t-${parsed.kind}">${em(TYPE[parsed.kind].icon)}${TYPE[parsed.kind].label}</span>
        ${s ? `<span class="qchip subj" style="--sc:${s.color}">${sdot(s)}${esc(s.name)}</span>` : ''}
        <span class="qchip">${DU.prettyShort(parsed.date)} <small>${DU.relative(parsed.date)}</small></span>
        <span class="qchip">${parsed.start}</span><span class="qp-hint">↵ Enter</span>`;
    };
    input.addEventListener('input', update);
    update();
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (parsed) {
        const p = parsed;
        input.value = ''; update();
        openEventModal({ type: p.kind, title: p.title, subject: p.subject || null, date: p.date, start: p.start, end: p.end, notes: p.notes || '' });
      } else if (state.settings.geminiKey) {
        input.value = ''; update();
        openChat(); sendChat(text);
      } else {
        toast('No entendí 🤔 Prueba con "examen de mate el jueves" o conecta la IA en Ajustes');
      }
    });
    setupMic($('#quickMic'), input, update);
  }

  function setupMic(btn, input, onChange, onFinal) {
    if (!btn) return;
    if (!FX.canListen) { btn.style.display = 'none'; return; }
    let rec = null;
    btn.onclick = () => {
      if (rec) { rec.stop(); return; }
      btn.classList.add('rec');
      rec = FX.listen({
        onText: (t, final) => { input.value = t; onChange && onChange(); if (final && onFinal) onFinal(t); },
        onEnd: () => { btn.classList.remove('rec'); rec = null; input.focus(); },
        onError: (msg) => toast('🎤 ' + msg),
      });
    };
  }

  // =========================================================
  //  Chat con la asistente (burbuja flotante)
  // =========================================================
  const SUGGESTIONS = ['Tengo examen de mate el jueves', '¿Qué tengo esta semana?', 'Planifica mi estudio', 'Propón tiempo para mi negocio'];

  function renderLuna() {
    const mood = lunaMood();
    $$('.luna-face').forEach((n) => (n.textContent = mood.face));
    $('#lunaMood').textContent = state.settings.geminiKey ? mood.text : 'modo básico · conectar IA gratis →';
    $('#lunaMood').classList.toggle('link-like', !state.settings.geminiKey);
    $('#lunaFab').classList.toggle('unread', ui.unread);
    $('#lunaFab').title = `Luna: ${mood.text} (tecla L)`;
  }
  function openChat() {
    ui.chatOpen = true; ui.unread = false;
    $('#app').classList.add('chat-open');
    renderLuna(); renderChat();
    setTimeout(() => $('#chatInput').focus(), 60);
  }
  function closeChat() { ui.chatOpen = false; $('#app').classList.remove('chat-open'); }

  function renderChat() {
    const log = $('#chatLog');
    log.innerHTML = '';
    if (!state.chat.length) {
      log.appendChild(el(`<div class="msg bot">¡Hola! Soy Luna 🌙. Cuéntame tus exámenes, tareas o planes y los pongo en tu calendario.
Te preguntaré qué tan importantes y difíciles son, y cuánto tiempo te tomarán, para proponerte un plan de estudio en tus horas libres (tú lo apruebas).

Prueba: "Tengo examen de física el miércoles, entra MRUV".</div>`));
    }
    state.chat.forEach((msg) => {
      if (msg.text) log.appendChild(el(`<div class="msg ${msg.role === 'user' ? 'user' : 'bot'} ${msg.error ? 'err' : ''}">${esc(msg.text)}</div>`));
      (msg.actions || []).forEach((a) => log.appendChild(renderActionCard(a)));
    });
    if (ui.chatBusy) log.appendChild(el('<div class="msg bot typing"><span></span><span></span><span></span></div>'));
    log.scrollTop = log.scrollHeight;

    const sg = $('#chatSuggest');
    sg.innerHTML = '';
    if (state.chat.length < 4) SUGGESTIONS.forEach((t) => {
      const b = el(`<button type="button">${esc(t)}</button>`);
      b.onclick = () => sendChat(t);
      sg.appendChild(b);
    });
  }

  function resolveAction(a, status, note) { a.status = status; a.note = note; persist(); renderChat(); }

  function renderActionCard(a) {
    const done = a.status && a.status !== 'pending';
    if (a.type === 'create_event') {
      const kind = TYPE[a.kind] ? a.kind : 'evento';
      a.kind = kind;
      const subj = a.subject && SUBJECTS[a.subject];
      const card = el(`<div class="action-card ${done ? 'resolved' : ''}">
        <div class="ah"><span class="tag t-${kind}">${TYPE[kind].label}</span><b>${subj ? sdot(subj) : ''}${esc(a.title)}</b></div>
        <div class="meta">📅 ${a.date ? DU.pretty(a.date) : '?'} · ${esc(a.start || '')}${a.end ? '–' + esc(a.end) : ''}${a.notes ? '<br>📝 ' + esc(a.notes) : ''}</div>
        ${done ? `<div class="status-note">${esc(a.note || '')}</div>` : `<div class="qwrap">${questionsHTML({ ...a, type: kind })}</div>
        <div class="row-btns">
          ${kind !== 'evento' ? '<button class="btn primary sm" data-a="plan">Guardar y planificar</button>' : ''}
          <button class="btn sm ${kind === 'evento' ? 'primary' : ''}" data-a="save">Guardar</button>
          <button class="btn sm" data-a="edit">Editar más</button>
          <button class="btn sm ghost" data-a="no">Descartar</button>
        </div>`}
      </div>`);
      if (done) return card;
      bindQuestions($('.qwrap', card), a, () => persist());
      const toEvent = () => ({
        type: kind, title: a.title, subject: a.subject && SUBJECTS[a.subject] ? a.subject : null, date: a.date || DU.today(),
        start: a.start || '08:00', end: a.end || DU.toTime(DU.toMin(a.start || '08:00') + 60),
        importance: a.importance || null, difficulty: a.difficulty || null, estMinutes: a.estMinutes || null, notes: a.notes || '',
      });
      const save = (plan) => {
        const miss = missingQuestions({ ...a, type: kind });
        if (miss.length) {
          miss.forEach((k) => { const q = $(`.q[data-q=${k}]`, card); q && q.classList.add('missing'); });
          toast('Responde las 3 preguntas 👇');
          return;
        }
        const ev = addEvent(toEvent());
        a.eventId = ev.id;
        commit();
        resolveAction(a, 'done', `✓ Guardado en el calendario (${DU.prettyShort(ev.date)} ${ev.start})`);
        if (plan) openPlanModal(ev);
      };
      $('[data-a=save]', card).onclick = () => save(false);
      const pb = $('[data-a=plan]', card);
      if (pb) pb.onclick = () => save(true);
      $('[data-a=edit]', card).onclick = () => openEventModal({ ...toEvent(), estimated: false }, {
        onSaved: (ev) => { a.eventId = ev.id; resolveAction(a, 'done', `✓ Guardado (${DU.prettyShort(ev.date)} ${ev.start})`); },
      });
      $('[data-a=no]', card).onclick = () => resolveAction(a, 'dismissed', 'Descartado');
      return card;
    }

    if (a.type === 'update_event' || a.type === 'delete_event' || a.type === 'plan_study') {
      const ev = getEv(a.id);
      if (!ev) return el('<div class="action-card resolved"><div class="meta">No encontré ese evento (quizá ya se borró).</div></div>');
      let desc = '', btn = '';
      if (a.type === 'update_event') {
        desc = Object.entries(a.changes || {}).map(([k, val]) => `${esc(k)}: <b>${esc(val)}</b>`).join(' · ');
        btn = 'Aplicar cambios';
      } else if (a.type === 'delete_event') { desc = 'Se eliminará del calendario.'; btn = 'Eliminar'; }
      else {
        const preview = P.planStudy(state, ev);
        desc = `Propuesta: ${preview.sessions.length} sesiones · ${DU.fmtDur(preview.planned)}`;
        btn = 'Revisar y aprobar';
      }
      const label = a.type === 'update_event' ? 'Cambiar' : a.type === 'delete_event' ? 'Eliminar' : 'Plan de estudio';
      const card = el(`<div class="action-card ${done ? 'resolved' : ''}">
        <div class="ah"><span class="tag t-${ev.type}">${label}</span><b>${esc(ev.title)}</b></div>
        <div class="meta">${DU.pretty(ev.date)} ${ev.start || ''}<br>${desc}</div>
        ${done ? `<div class="status-note">${esc(a.note || '')}</div>` : `<div class="row-btns">
          <button class="btn sm ${a.type === 'delete_event' ? 'danger' : 'primary'}" data-a="ok">${btn}</button>
          <button class="btn sm ghost" data-a="no">${a.type === 'plan_study' ? 'Ahora no' : 'Cancelar'}</button></div>`}
      </div>`);
      if (done) return card;
      $('[data-a=ok]', card).onclick = async () => {
        if (a.type === 'update_event') {
          const ch = { ...(a.changes || {}) };
          ['importance', 'difficulty', 'estMinutes'].forEach((k) => { if (ch[k] != null) ch[k] = +ch[k]; });
          if (ch.done != null) markDone(ev, !!ch.done);
          delete ch.done; delete ch.id;
          Object.assign(ev, ch);
          commit();
          resolveAction(a, 'done', '✓ Cambios aplicados');
        } else if (a.type === 'delete_event') {
          if (await deleteEvent(ev, false)) resolveAction(a, 'done', '✓ Eliminado');
        } else {
          openPlanModal(ev);
          resolveAction(a, 'done', '✓ Plan abierto');
        }
      };
      $('[data-a=no]', card).onclick = () => resolveAction(a, 'dismissed', 'Cancelado');
      return card;
    }

    if (a.type === 'check_goal') {
      const g = state.goals.find((x) => x.id === a.goalId);
      if (!a.status) {
        if (g) {
          const date = a.date || DU.today();
          setGoal(g.id, date, true);
          a.status = 'done'; a.note = `✓ ${g.icon} ${g.title} — ${DU.prettyShort(date)}`;
          persist(); setTimeout(renderAll, 0);
        } else { a.status = 'dismissed'; a.note = 'No encontré esa meta'; }
      }
      return el(`<div class="action-card resolved"><div class="status-note">${esc(a.note)}</div></div>`);
    }

    if (a.type === 'plan_business') {
      const g = state.goals.find((x) => x.id === 'biz') || state.goals.find((x) => /negocio/i.test(x.title));
      const card = el(`<div class="action-card ${done ? 'resolved' : ''}">
        <div class="ah"><span class="tag t-meta">Negocio</span><b>Tiempo para tus ideas</b></div>
        ${done ? `<div class="status-note">${esc(a.note || '')}</div>` : '<div class="row-btns"><button class="btn primary sm" data-a="ok">Ver propuesta</button></div>'}
      </div>`);
      if (!done) $('[data-a=ok]', card).onclick = () => {
        if (!g) { toast('Primero crea una meta de negocio en "Metas"'); return; }
        openPlanModal(null, { goal: g });
        resolveAction(a, 'done', '✓ Propuesta abierta');
      };
      return card;
    }
    return el(`<div class="action-card resolved"><div class="meta">Acción no reconocida (${esc(a.type)})</div></div>`);
  }

  async function sendChat(text) {
    text = (text || '').trim();
    if (!text || ui.chatBusy) return;
    state.chat.push({ id: uid(), role: 'user', text, at: Date.now() });
    if (state.chat.length > 80) state.chat = state.chat.slice(-80);
    ui.chatBusy = true;
    persist();
    renderChat(); renderLuna();
    try {
      const res = await AI.ask(state, text);
      res.actions.forEach((a) => (a.status = a.type === 'check_goal' ? undefined : 'pending'));
      state.chat.push({ id: uid(), role: 'bot', text: res.reply || (res.actions.length ? 'Listo 👇' : '🤔'), actions: res.actions, at: Date.now() });
    } catch (e) {
      state.chat.push({ id: uid(), role: 'bot', text: '⚠️ ' + e.message, error: true, at: Date.now() });
    } finally {
      ui.chatBusy = false;
      if (!ui.chatOpen) ui.unread = true;
      persist();
      renderChat(); renderLuna();
    }
  }

  // =========================================================
  //  Ajustes
  // =========================================================
  const ACCENTS = [
    ['tinta', 'Papel y tinta', '#FAFAF9', '#4B5BDC'],
    ['arena', 'Arena', '#F6F3EE', '#C2563A'],
    ['salvia', 'Salvia', '#F7F8F6', '#5B8A72'],
    ['raimondi', 'Raimondi', '#ffffff', '#138A4A'],
  ];
  function openSettings(focus) {
    const st = state.settings;
    const routines = JSON.parse(JSON.stringify(state.routines));
    const noSchool = [...st.noSchoolDates];
    let accent = st.accent || 'tinta';
    let saved = false;
    const notifState = !('Notification' in window) ? 'Tu navegador no soporta notificaciones.'
      : Notification.permission === 'granted' ? (st.notifications ? '✅ Activadas' : 'Permiso concedido, pero desactivadas')
        : Notification.permission === 'denied' ? '❌ Bloqueadas en el navegador (actívalas en el candado de la barra de direcciones)' : 'Aún no activadas';

    const m = openModal(`
      <div class="modal-head"><h2>Ajustes</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="modal-body settings">
        <section>
          <h4>Apariencia</h4>
          <div class="field"><span>Estilo</span><div class="swatches">${ACCENTS.map(([k, n, a, b]) => `<button type="button" data-acc="${k}" class="${accent === k ? 'sel' : ''}" title="${n}"><i style="background:linear-gradient(135deg,${a} 0 50%,${b} 50%)"></i>${n}</button>`).join('')}</div></div>
          <div class="row">
            <label class="field"><span>Tema</span><select id="sTheme"><option value="auto">Automático (como el sistema)</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
            <label class="field"><span>Notas de exámenes sobre</span><select id="sScale"><option value="20">20</option><option value="10">10</option><option value="100">100</option></select></label>
          </div>
          <label class="switch"><input type="checkbox" id="sGame" ${st.gameMode ? 'checked' : ''}><span>🎮 Modo juego: exámenes como jefes con barra de vida, emojis en el calendario, sonidos y confeti</span></label>
          <label class="switch"><input type="checkbox" id="sNight" ${st.nightMode ? 'checked' : ''}><span>🌙 Modo noche automático: desde 30 min antes de dormir la app se oscurece y te propone leer 10 min</span></label>
          <label class="switch"><input type="checkbox" id="sExpand" ${st.expandSchool ? 'checked' : ''}><span>🏫 Mostrar el colegio expandido en la semana</span></label>
          <div><button class="btn sm" id="sTour">${icon('help', 14)} Ver el recorrido otra vez</button></div>
        </section>
        <section id="secAI">
          <h4>✨ Asistente con IA (gratis)</h4>
          <div class="hint">Luna usa Google Gemini, que tiene un plan gratuito. Solo necesitas una clave (API key):</div>
          <ol class="steps">
            <li>Entra a <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> con tu cuenta de Google.</li>
            <li>Haz clic en <b>“Create API key”</b> (Crear clave de API).</li>
            <li>Copia la clave y pégala aquí abajo. Se guarda <b>solo en este navegador</b>.</li>
          </ol>
          <label class="field"><span>API key de Gemini</span><input type="password" id="sKey" placeholder="AIza…" value="${esc(st.geminiKey)}" autocomplete="off"></label>
          <div class="row">
            <label class="field"><span>Modelo</span><input type="text" id="sModel" list="models" value="${esc(st.geminiModel)}">
              <datalist id="models"><option value="gemini-flash-latest"><option value="gemini-2.5-flash"><option value="gemini-flash-lite-latest"><option value="gemini-2.5-flash-lite"></datalist></label>
            <div class="field" style="justify-content:flex-end"><button class="btn" id="sTest">Probar conexión</button></div>
          </div>
          <div class="hint" id="sTestOut">Sin clave, Luna funciona en “modo básico” (entiende frases simples).</div>
        </section>
        <section>
          <h4>🌙 Sueño y estudio</h4>
          <div class="row">
            <label class="field"><span>Dormir antes de</span><input type="time" id="sBed" value="${st.bedtime}"></label>
            <label class="field"><span>Estudiar hasta (entre semana)</span><input type="time" id="sStudyEnd" value="${st.studyEnd}"></label>
          </div>
          <div class="row">
            <label class="field"><span>Fin de semana: mañana</span><div class="row"><input type="time" id="sW1a" value="${st.weekendWindows[0][0]}"><input type="time" id="sW1b" value="${st.weekendWindows[0][1]}"></div></label>
            <label class="field"><span>Fin de semana: tarde</span><div class="row"><input type="time" id="sW2a" value="${(st.weekendWindows[1] || ['', ''])[0]}"><input type="time" id="sW2b" value="${(st.weekendWindows[1] || ['', ''])[1]}"></div></label>
          </div>
        </section>
        <section>
          <h4>⚽ Actividades fijas</h4>
          <div class="hint">Luna nunca propone estudio en estos horarios.</div>
          <div id="routineList" style="display:flex;flex-direction:column;gap:6px"></div>
          <div><button class="btn sm" id="addRoutine">${icon('plus', 14)} Agregar actividad</button></div>
        </section>
        <section>
          <h4>🏫 Colegio</h4>
          <div class="row">
            <label class="field"><span>Último día de clases (opcional)</span><input type="date" id="sSchoolEnd" value="${st.schoolEnd}"></label>
            <label class="field"><span>Agregar día sin clases</span><div class="row"><input type="date" id="sNoSchool"><button class="btn sm" id="addNoSchool" style="flex:0">＋</button></div></label>
          </div>
          <div id="noSchoolList" class="type-chips"></div>
        </section>
        <section>
          <h4>🔔 Recordatorios</h4>
          <div class="hint">Te aviso la noche anterior (19:00) y la mañana de cada examen/tarea, 10 min antes de cada sesión y a la hora de leer. Funciona mientras la app esté abierta en una pestaña.</div>
          <div class="row"><div class="hint" id="notifState">${notifState}</div><button class="btn" id="sNotif" style="flex:0">${st.notifications ? 'Desactivar' : 'Activar notificaciones'}</button></div>
        </section>
        <section>
          <h4>💾 Tus datos</h4>
          <div class="hint">Todo se guarda en este navegador. Haz una copia de vez en cuando.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn sm" id="sExport">⬇️ Exportar copia</button>
            <label class="btn sm">⬆️ Importar copia<input type="file" id="sImport" accept="application/json" hidden></label>
            <button class="btn sm danger" id="sReset">Borrar todo</button>
          </div>
        </section>
      </div>
      <div class="modal-foot"><span class="spacer"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="sSave">Guardar</button></div>`,
    { wide: true, onClose: () => { if (!saved) applyTheme(); } });
    const r = m.root;
    $('#sTheme', r).value = st.theme;
    $('#sScale', r).value = String(st.gradeScale || 20);
    $$('[data-acc]', r).forEach((b) => (b.onclick = () => {
      accent = b.dataset.acc;
      document.documentElement.dataset.accent = accent; // vista previa en vivo
      $$('[data-acc]', r).forEach((x) => x.classList.toggle('sel', x === b));
    }));
    $('#sTour', r).onclick = () => { m.close(); App.tour.start(); };

    const DL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const renderRoutines = () => {
      const box = $('#routineList', r);
      box.innerHTML = '';
      routines.forEach((rt, i) => {
        const row = el(`<div class="routine-row">
          <input type="text" value="${esc((rt.icon ? rt.icon + ' ' : '') + rt.title)}">
          <div class="daypick">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-d="${d}" class="${rt.days.includes(d) ? 'sel' : ''}">${DL[d]}</button>`).join('')}</div>
          <input type="time" value="${rt.start}"><input type="time" value="${rt.end}">
          <button class="icon-btn sm" title="Quitar">${icon('x', 14)}</button></div>`);
        const [tIn, sIn, eIn] = $$('input', row);
        tIn.onchange = () => {
          const mm = tIn.value.trim().match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
          if (mm) { rt.icon = mm[1]; rt.title = mm[2]; } else { rt.icon = ''; rt.title = tIn.value.trim(); }
        };
        sIn.onchange = () => (rt.start = sIn.value);
        eIn.onchange = () => (rt.end = eIn.value);
        $$('.daypick button', row).forEach((b) => (b.onclick = () => {
          const d = +b.dataset.d;
          rt.days = rt.days.includes(d) ? rt.days.filter((x) => x !== d) : [...rt.days, d];
          b.classList.toggle('sel');
        }));
        $('.icon-btn', row).onclick = () => { routines.splice(i, 1); renderRoutines(); };
        box.appendChild(row);
      });
    };
    renderRoutines();
    $('#addRoutine', r).onclick = () => { routines.push({ id: uid(), title: 'Nueva actividad', icon: '📌', days: [6], start: '10:00', end: '11:00' }); renderRoutines(); };

    const renderNoSchool = () => {
      const box = $('#noSchoolList', r);
      box.innerHTML = noSchool.sort().map((d, i) => `<button type="button" data-i="${i}">🏖️ ${DU.prettyShort(d)} ✕</button>`).join('');
      $$('button', box).forEach((b) => (b.onclick = () => { noSchool.splice(+b.dataset.i, 1); renderNoSchool(); }));
    };
    renderNoSchool();
    $('#addNoSchool', r).onclick = () => { const v = $('#sNoSchool', r).value; if (v && !noSchool.includes(v)) { noSchool.push(v); renderNoSchool(); } };

    $('#sTest', r).onclick = async () => {
      const out = $('#sTestOut', r);
      out.textContent = 'Probando…';
      const tmp = { ...state, settings: { ...st, geminiKey: $('#sKey', r).value.trim(), geminiModel: $('#sModel', r).value.trim() } };
      try { await AI.testConnection(tmp); out.textContent = '✅ ¡Conectado! Luna ya puede entender cualquier frase.'; }
      catch (e) { out.textContent = '❌ ' + e.message; }
    };
    $('#sNotif', r).onclick = async () => {
      if (!('Notification' in window)) return;
      if (st.notifications) { st.notifications = false; persist(); $('#notifState', r).textContent = 'Desactivadas'; $('#sNotif', r).textContent = 'Activar notificaciones'; return; }
      const p = await Notification.requestPermission();
      st.notifications = p === 'granted';
      persist();
      $('#notifState', r).textContent = p === 'granted' ? '✅ Activadas' : '❌ No se dio permiso';
      $('#sNotif', r).textContent = st.notifications ? 'Desactivar' : 'Activar notificaciones';
      if (st.notifications) new Notification('🔔 Recordatorios activados', { body: 'Te avisaré de tus exámenes, tareas y sesiones de estudio.' });
    };
    $('#sExport', r).onclick = () => {
      const blob = new Blob([JSON.stringify({ ...state, settings: { ...state.settings, geminiKey: '' } }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mi-agenda-${DU.today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $('#sImport', r).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.events)) throw new Error('Archivo no válido');
        if (!(await confirmBox('Esto reemplazará tus datos actuales por los de la copia. ¿Continuar?', 'Importar'))) return;
        const key = state.settings.geminiKey;
        const base = A.freshState();
        state = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}), geminiKey: key || (data.settings || {}).geminiKey || '' } };
        saved = true; m.close(); commit(); renderChat();
        toast('✅ Copia importada');
      } catch (err) { toast('❌ No se pudo importar: ' + err.message); }
    };
    $('#sReset', r).onclick = async () => {
      if (!(await confirmBox('¿Borrar TODOS tus eventos, metas y conversación? No se puede deshacer.', 'Borrar todo', true))) return;
      const key = state.settings.geminiKey;
      state = A.freshState();
      state.settings.geminiKey = key;
      state.settings.tourDone = true;
      saved = true; m.close(); commit(); renderChat();
    };
    $('#sSave', r).onclick = () => {
      st.geminiKey = $('#sKey', r).value.trim();
      st.geminiModel = $('#sModel', r).value.trim() || 'gemini-flash-latest';
      st.bedtime = $('#sBed', r).value || '21:30';
      st.studyEnd = $('#sStudyEnd', r).value || '21:00';
      const w = [[$('#sW1a', r).value, $('#sW1b', r).value], [$('#sW2a', r).value, $('#sW2b', r).value]].filter(([a, b]) => a && b && a < b);
      st.weekendWindows = w.length ? w : A.DEFAULT_SETTINGS.weekendWindows;
      st.schoolEnd = $('#sSchoolEnd', r).value;
      st.noSchoolDates = noSchool;
      st.theme = $('#sTheme', r).value;
      st.accent = accent;
      st.gradeScale = +$('#sScale', r).value;
      st.nightMode = $('#sNight', r).checked;
      st.gameMode = $('#sGame', r).checked;
      st.expandSchool = $('#sExpand', r).checked;
      state.routines = routines.filter((x) => x.title && x.start && x.end && x.start < x.end && x.days.length);
      const sleep = state.goals.find((g) => g.id === 'sleep');
      if (sleep && /antes de las \d/.test(sleep.title)) sleep.title = `Dormir antes de las ${st.bedtime}`;
      saved = true;
      m.close();
      state.summary = null;
      ui.weekScroll = null;
      commit();
      refreshSummary(true);
      toast('Ajustes guardados');
    };
    if (focus === 'ai') setTimeout(() => { $('#secAI', r).scrollIntoView({ block: 'start' }); $('#sKey', r).focus(); }, 60);
  }

  // =========================================================
  //  Recordatorios
  // =========================================================
  function notify(title, body) {
    if (state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body }); } catch (_) { /* nada */ }
    }
    toast(`${title} — ${body}`, [], 8000);
  }
  function checkReminders() {
    const today = DU.today();
    const nm = DU.nowMin();
    const sent = state.notified;
    const once = (key, fn) => { const k = today + '|' + key; if (!sent[k]) { sent[k] = 1; fn(); persist(); } };
    state.events.forEach((e) => {
      if (e.done || !e.start) return;
      const s = DU.toMin(e.start);
      if (e.type === 'examen' || e.type === 'tarea') {
        if (DU.addDays(today, 1) === e.date && nm >= 19 * 60 && nm < DU.toMin(state.settings.bedtime))
          once(e.id + ':eve', () => notify(`Mañana: ${e.title}`, `${e.start}${e.type === 'examen' ? ' · ¡repasa y duerme bien!' : ' · ¿ya está lista?'}`));
        if (today === e.date && nm >= 6 * 60 + 15 && nm < s)
          once(e.id + ':morning', () => notify(`Hoy: ${e.title}`, `A las ${e.start}. ¡Tú puedes! 💪`));
      } else if (today === e.date && nm >= s - 10 && nm < s) {
        once(e.id + ':soon', () => notify(`En 10 min: ${e.title}`, `${e.start}–${e.end || ''}`));
      }
    });
    Object.keys(sent).forEach((k) => { if (k.slice(0, 10) < DU.addDays(today, -3)) delete sent[k]; });
  }

  // =========================================================
  //  Arranque
  // =========================================================
  function step(dir) {
    if (ui.view === 'week') ui.cursor = DU.addDays(ui.cursor, 7 * dir);
    else if (ui.view === 'month') { const d = DU.parse(ui.cursor); ui.cursor = DU.fmt(new Date(d.getFullYear(), d.getMonth() + dir, 1)); }
    else return;
    ui.miniCursor = ui.cursor;
    renderAll();
  }
  function setView(v) { ui.view = v; ui.weekScroll = null; renderAll(); }

  function bind() {
    $('#prevBtn').innerHTML = icon('left'); $('#nextBtn').innerHTML = icon('right');
    $('#addBtn').innerHTML = `${icon('plus', 16)}<span>Nuevo</span>`;
    $('#settingsBtn').innerHTML = icon('settings'); $('#helpBtn').innerHTML = icon('help');
    $('#closeChat').innerHTML = icon('x', 16); $('#clearChat').innerHTML = icon('trash', 15);
    $('#chatSend').innerHTML = icon('send', 16); $('#chatMic').innerHTML = icon('mic', 16); $('#quickMic').innerHTML = icon('mic', 18);
    $('#quickIcon').innerHTML = icon('sparkles', 18);

    $$('.tab').forEach((t) => (t.onclick = () => setView(t.dataset.view)));
    $$('[data-goto]').forEach((b) => (b.onclick = () => setView(b.dataset.goto)));
    $('#prevBtn').onclick = () => step(-1);
    $('#nextBtn').onclick = () => step(1);
    $('#todayBtn').onclick = () => { ui.cursor = DU.today(); ui.miniCursor = ui.cursor; ui.weekScroll = null; renderAll(); };
    $('#addBtn').onclick = () => openEventModal({});
    $('#settingsBtn').onclick = () => openSettings();
    $('#helpBtn').onclick = () => App.tour.start();
    $('#themeBtn').onclick = () => {
      if (ui.night) { toast('🌙 Es de noche: el modo noche está activo (puedes desactivarlo en Ajustes)'); return; }
      state.settings.theme = isDark() ? 'light' : 'dark'; applyTheme(); persist();
    };
    $('#showDone').onchange = (e) => { ui.showDone = e.target.checked; renderSidebar(); };
    $('#lunaFab').onclick = () => (ui.chatOpen ? closeChat() : openChat());
    $('#closeChat').onclick = closeChat;
    $('#lunaMood').onclick = () => { if (!state.settings.geminiKey) openSettings('ai'); };
    $('#clearChat').onclick = async () => {
      if (state.chat.length && await confirmBox('¿Borrar la conversación con Luna? (tus eventos no se borran)', 'Borrar')) { state.chat = []; persist(); renderChat(); }
    };
    $('#chatForm').onsubmit = (e) => { e.preventDefault(); const i = $('#chatInput'); const t = i.value; i.value = ''; sendChat(t); };
    $('#chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); }
    });
    setupMic($('#chatMic'), $('#chatInput'), null, () => $('#chatForm').requestSubmit());
    setupQuickbar();
    document.addEventListener('keydown', (e) => {
      if ($('#modalRoot').children.length || $('.focus-ov') || $('.tour') || /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'n') { e.preventDefault(); openEventModal({}); }
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 't') $('#todayBtn').click();
      else if (e.key === '/') { e.preventDefault(); $('#quickInput').focus(); }
      else if (e.key === 'l') { e.preventDefault(); openChat(); }
      else if (e.key === 'Escape' && ui.chatOpen) closeChat();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'auto') applyTheme(); });
    window.addEventListener('storage', (e) => { if (e.key === 'agenda-raimondi-v1') { state = A.load(); renderAll(); renderChat(); } });
  }

  let lastDay = DU.today();
  let lastNight = null;
  function tick() {
    checkReminders();
    const night = isNightTime();
    if (DU.today() !== lastDay) { lastDay = DU.today(); ui.cursor = lastDay; ui.miniCursor = lastDay; renderAll(); refreshSummary(); }
    else if (lastNight !== null && night !== lastNight) renderAll();
    else {
      if (ui.view === 'today' && !$('#modalRoot').children.length) renderView();
      else if (ui.view === 'week') {
        const line = $('.now-line');
        if (line) line.style.top = `${makeScale().y(DU.nowMin())}px`;
      }
      renderLuna();
    }
    lastNight = night;
    App.rituals && App.rituals.tick();
  }

  // ---------- API compartida con los demás módulos ----------
  const App = window.App = {
    ui, $, $$, esc, el, icon, persist, commit, toast, openModal, confirmBox, TYPE, IMP, DIF, stars, dur,
    getEv, childrenOf, addEvent, markDone, addFocus, deleteEvent, bossOf, activeBosses, subjectFactor, pendingResults,
    resultHTML, bindResult, saveResult, G, em, sdot,
    isDoneGoal, setGoal, toggleGoal, streakOf, weekCount, subjOf, shortTitle, badge, lunaMood, summaryText, refreshSummary,
    renderAll, renderView, openEventModal, openPlanModal, openSettings, openChat, sendChat, setView, applyTheme,
    views: {},
    start() {
      bind();
      renderAll();
      renderChat();
      refreshSummary();
      tick();
      setInterval(tick, 30000);
      App.rituals && App.rituals.startup();
    },
  };
  Object.defineProperty(App, 'state', { get: () => state });
  window.__agenda = App;
})();

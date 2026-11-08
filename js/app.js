/* =========================================================
   app.js — interfaz: calendario, metas, chat con la asistente, recordatorios
   ========================================================= */
(function () {
  'use strict';
  const A = window.Agenda;
  const { DU, SUBJECTS, uid, classesOn } = A;
  const P = window.Planner;
  const AI = window.AI;

  let state = A.load();
  const ui = {
    view: 'week',
    cursor: DU.today(),
    chatBusy: false,
    weekScroll: null,
    showDone: false,
  };

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const persist = () => A.save(state);
  const commit = () => { persist(); renderAll(); };

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

  // ---------- toasts y diálogos ----------
  function toast(msg, actions = [], ms = 4000) {
    const t = el(`<div class="toast"><span>${esc(msg)}</span></div>`);
    actions.forEach((a) => {
      const b = el(`<button>${esc(a.label)}</button>`);
      b.onclick = () => { a.fn(); t.remove(); };
      t.appendChild(b);
    });
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function openModal(html, { wide = false, onClose } = {}) {
    const ov = el(`<div class="overlay"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
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

  // ---------- tema ----------
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
  }
  function isDark() {
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

  function setDone(ev, done) {
    ev.done = done;
    if (ev.goalId) {
      const log = (state.goalLog[ev.goalId] = state.goalLog[ev.goalId] || {});
      if (done) log[ev.date] = true;
    }
  }

  async function deleteEvent(ev, ask = true) {
    const kids = childrenOf(ev.id);
    if (ask) {
      const msg = kids.length
        ? `¿Eliminar "${ev.title}" y sus ${kids.length} sesiones de estudio?`
        : `¿Eliminar "${ev.title}"?`;
      if (!(await confirmBox(msg, 'Eliminar', true))) return false;
    }
    const ids = new Set([ev.id, ...kids.map((k) => k.id)]);
    const removed = state.events.filter((e) => ids.has(e.id));
    state.events = state.events.filter((e) => !ids.has(e.id));
    commit();
    toast('Eliminado', [{ label: 'Deshacer', fn: () => { state.events.push(...removed); commit(); } }]);
    return true;
  }

  // ---------- metas ----------
  const isDoneGoal = (g, d) => !!(state.goalLog[g.id] && state.goalLog[g.id][d]);
  function toggleGoal(gid, date = DU.today()) {
    const log = (state.goalLog[gid] = state.goalLog[gid] || {});
    if (log[date]) delete log[date]; else log[date] = true;
    commit();
    const g = state.goals.find((x) => x.id === gid);
    if (g && log[date] && date === DU.today()) {
      const s = streakOf(g);
      toast(`${g.icon} ¡Bien! ${s.current > 1 ? `Racha de ${s.current} ${g.freq === 'daily' ? 'días' : 'semanas'} 🔥` : 'Meta cumplida'}`);
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
      return { current: cur, best: Math.max(best, cur), unit: 'días' };
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
    return { current: cur, best: Math.max(best, cur), unit: 'semanas', week: weekCount(g, DU.startOfWeek(today)) };
  }

  // =========================================================
  //  RENDER
  // =========================================================
  function renderAll() {
    renderTopbar();
    renderMain();
    renderSidebar();
    renderChatStatus();
  }

  function renderTopbar() {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === ui.view));
    $('.datenav').style.visibility = ui.view === 'goals' ? 'hidden' : 'visible';
    let label = '';
    if (ui.view === 'week') {
      const s = DU.startOfWeek(ui.cursor), e = DU.addDays(s, 6);
      const ds = DU.parse(s), de = DU.parse(e);
      label = ds.getMonth() === de.getMonth()
        ? `${ds.getDate()} – ${de.getDate()} de ${DU.MONTHS[de.getMonth()]} ${de.getFullYear()}`
        : `${ds.getDate()} ${DU.MONTHS[ds.getMonth()].slice(0, 3)} – ${de.getDate()} ${DU.MONTHS[de.getMonth()].slice(0, 3)} ${de.getFullYear()}`;
    } else if (ui.view === 'month') {
      const d = DU.parse(ui.cursor);
      label = `${DU.MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    $('#rangeLabel').textContent = label;
  }

  function renderMain() {
    const main = $('#main');
    const prevBody = $('.week-body', main);
    if (prevBody) ui.weekScroll = prevBody.scrollTop;
    main.innerHTML = '';
    if (ui.view === 'week') main.appendChild(renderWeek());
    else if (ui.view === 'month') main.appendChild(renderMonth());
    else main.appendChild(renderGoals());
    const body = $('.week-body', main);
    if (body) {
      if (ui.weekScroll == null) {
        const ppm = getPPM();
        const target = Math.max(DU.toMin('07:00'), DU.nowMin() - 150);
        body.scrollTop = (target - state.settings.calStart * 60) * ppm;
      } else body.scrollTop = ui.weekScroll;
    }
  }

  function getPPM() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ppm'));
    return isNaN(v) ? 1.05 : v;
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

  function renderWeek() {
    const st = state.settings;
    const start = DU.startOfWeek(ui.cursor);
    const days = [...Array(7)].map((_, i) => DU.addDays(start, i));
    const today = DU.today();
    const c0 = st.calStart * 60, c1 = st.calEnd * 60;
    const ppm = getPPM();
    const y = (m) => (m - c0) * ppm;
    const H = (c1 - c0) * ppm;

    const wrap = el('<div class="week"></div>');
    const head = el('<div class="week-head"><div></div></div>');
    days.forEach((d) => {
      const w = DU.dow(d);
      const school = P.isSchoolDay(state, d);
      const weekdayNoSchool = w >= 1 && w <= 5 && !school;
      const studyMin = state.events.filter((e) => e.date === d && e.type === 'estudio').reduce((s, e) => s + (DU.toMin(e.end) - DU.toMin(e.start)), 0);
      const free = P.freeMinutes(state, d) + studyMin;
      const pct = free ? Math.min(100, Math.round(studyMin / free * 100)) : 0;
      const hd = el(`<div class="day-head ${d === today ? 'today' : ''}" title="Ver ${DU.pretty(d)}">
        <div class="dn">${DU.DAYS_SHORT[w]}</div><div class="dd">${DU.parse(d).getDate()}</div>
        ${weekdayNoSchool ? '<div class="noschool">sin clases</div>' : ''}
        <div class="load" title="Tiempo libre usado para estudiar: ${pct}%"><i style="width:${pct}%"></i></div>
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
      head.appendChild(hd);
    });
    wrap.appendChild(head);

    const body = el('<div class="week-body"></div>');
    const grid = el(`<div class="week-grid" style="height:${H}px"></div>`);
    const tcol = el('<div class="time-col"></div>');
    for (let hr = st.calStart; hr <= st.calEnd; hr++) {
      if (hr === st.calStart) continue;
      tcol.appendChild(el(`<div class="tl" style="top:${y(hr * 60)}px">${String(hr).padStart(2, '0')}:00</div>`));
    }
    grid.appendChild(tcol);

    days.forEach((d) => {
      const w = DU.dow(d);
      const col = el(`<div class="day-col ${w === 0 || w === 6 ? 'weekend' : ''}" data-date="${d}"></div>`);
      for (let hr = st.calStart; hr < st.calEnd; hr++) {
        col.appendChild(el(`<div class="hour-line" style="top:${y(hr * 60)}px"></div>`));
        col.appendChild(el(`<div class="hour-line half" style="top:${y(hr * 60 + 30)}px"></div>`));
      }
      // clases
      if (P.isSchoolDay(state, d)) {
        classesOn(w).forEach((c) => {
          const s = DU.toMin(c.start), e = DU.toMin(c.end);
          const b = el(`<div class="blk school" style="top:${y(s)}px;height:${(e - s) * ppm - 2}px;--c:${c.color}" title="${esc(c.name)} · ${esc(c.teacher)} (${c.start}-${c.end})">
            <div class="bt">${esc(c.name)}</div><div class="bm">${esc(c.teacher)} · ${c.start}</div></div>`);
          b.onclick = (ev) => {
            ev.stopPropagation();
            toast(`${c.name} · ${c.teacher} · ${c.start}–${c.end}`, [
              { label: '＋ Examen', fn: () => openEventModal({ type: 'examen', subject: c.subject, date: d, start: c.start, end: c.end }) },
              { label: '＋ Tarea', fn: () => openEventModal({ type: 'tarea', subject: c.subject, date: d, start: c.start, end: DU.toTime(DU.toMin(c.start) + 30) }) },
            ], 6000);
          };
          col.appendChild(b);
        });
      }
      // rutina
      P.routinesOn(state, d).forEach((r) => {
        const s = DU.toMin(r.start), e = DU.toMin(r.end);
        col.appendChild(el(`<div class="blk routine" style="top:${y(s)}px;height:${(e - s) * ppm - 2}px" title="${esc(r.title)} ${r.start}-${r.end}">
          <div class="bt">${r.icon || ''} ${esc(r.title)}</div><div class="bm">${r.start}–${r.end}</div></div>`));
      });
      // lectura + hora de dormir
      const bed = DU.toMin(st.bedtime);
      if (state.goals.some((g) => g.id === 'read')) {
        col.appendChild(el(`<div class="blk read" style="top:${y(bed - 25)}px;height:${12 * ppm}px">📖 leer 10 min</div>`));
      }
      if (bed > c0 && bed < c1) col.appendChild(el(`<div class="bed-line" style="top:${y(bed)}px"><span>🌙 ${st.bedtime}</span></div>`));

      // eventos
      const evs = state.events.filter((e) => e.date === d && e.start);
      layoutLanes(evs).forEach(({ e, s, en, lane, n }) => {
        const wpct = 100 / n;
        const subj = e.subject && SUBJECTS[e.subject];
        const b = el(`<div class="blk ev t-${e.type} ${e.done ? 'done' : ''}" style="top:${y(s)}px;height:${Math.max(18, (en - s) * ppm - 2)}px;left:calc(${lane * wpct}% + 6px);width:calc(${wpct}% - 9px);right:auto"
          title="${esc(e.title)} · ${e.start}–${e.end || ''}">
          <div class="bt">${TYPE[e.type] ? TYPE[e.type].icon : ''} ${esc(e.title)}</div>
          <div class="bm">${e.start}${e.end ? '–' + e.end : ''}${subj ? ' · ' + esc(subj.name) : ''}</div>
          ${e.importance && (e.type === 'examen' || e.type === 'tarea') ? `<span class="badges">${'!'.repeat(Math.max(0, e.importance - 2))}</span>` : ''}
        </div>`);
        b.onclick = (ev) => { ev.stopPropagation(); openEventModal({ id: e.id }); };
        col.appendChild(b);
      });

      if (d === today) {
        const nm = DU.nowMin();
        if (nm > c0 && nm < c1) col.appendChild(el(`<div class="now-line" style="top:${y(nm)}px"></div>`));
      }
      col.onclick = (ev) => {
        if (ev.target !== col && !ev.target.classList.contains('hour-line')) return;
        const rect = col.getBoundingClientRect();
        const m = Math.round((c0 + (ev.clientY - rect.top) / ppm) / 15) * 15;
        openEventModal({ date: d, start: DU.toTime(m), end: DU.toTime(m + 60) });
      };
      grid.appendChild(col);
    });
    head.querySelectorAll('.day-head').forEach((hd, i) => {
      hd.addEventListener('click', () => openEventModal({ date: days[i] }));
    });
    body.appendChild(grid);
    wrap.appendChild(body);
    return wrap;
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
    grid.style.gridTemplateRows = 'auto';
    const order = { examen: 0, tarea: 1, evento: 2, meta: 3, estudio: 4 };
    for (let i = 0; i < 42; i++) {
      const d = DU.addDays(start, i);
      const dd = DU.parse(d);
      const evs = state.events.filter((e) => e.date === d)
        .sort((a, b) => order[a.type] - order[b.type] || (a.start || '').localeCompare(b.start || ''));
      const w = dd.getDay();
      const noSchool = w >= 1 && w <= 5 && !P.isSchoolDay(state, d);
      const cell = el(`<div class="mcell ${dd.getMonth() !== cur.getMonth() ? 'other' : ''} ${d === today ? 'today' : ''}">
        <div class="mn"><span>${dd.getDate()}</span>${noSchool ? '<small>sin clases</small>' : ''}</div>
        ${evs.slice(0, 3).map((e) => `<div class="chip t-${e.type} ${e.done ? 'done' : ''}" title="${esc(e.title)}">${esc(e.start || '')} ${esc(e.title)}</div>`).join('')}
        ${evs.length > 3 ? `<div class="more">+${evs.length - 3} más</div>` : ''}
      </div>`);
      cell.onclick = () => { ui.cursor = d; ui.view = 'week'; ui.weekScroll = null; renderAll(); };
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  // ---------- Metas ----------
  function renderGoals() {
    const today = DU.today();
    const wrap = el(`<div class="goals-view">
      <div class="goals-top"><div><h2>Mis metas</h2><div class="hint">Marca cada día lo que cumpliste y mantén tus rachas 🔥. Toca un cuadrito para marcar días anteriores.</div></div>
      <button class="btn primary" id="addGoal">＋ Nueva meta</button></div>
      <div class="goals-grid"></div></div>`);
    $('#addGoal', wrap).onclick = () => openGoalModal();
    const grid = $('.goals-grid', wrap);
    state.goals.forEach((g) => {
      const s = streakOf(g);
      const doneToday = isDoneGoal(g, today);
      const days = [...Array(28)].map((_, i) => DU.addDays(today, i - 27));
      const card = el(`<div class="goal-card">
        <div class="gh"><span class="gi">${esc(g.icon)}</span>
          <div><b>${esc(g.title)}</b><small>${g.freq === 'daily' ? 'Todos los días' : `${g.target} ${g.target === 1 ? 'vez' : 'veces'} por semana`}${g.optional ? ' · opcional' : ''}</small></div>
          <div class="actions"><button class="icon-btn sm" data-a="edit" title="Editar">✏️</button><button class="icon-btn sm" data-a="del" title="Eliminar">🗑️</button></div>
        </div>
        ${g.note ? `<div class="hint">${esc(g.note)}</div>` : ''}
        <div class="streaks">
          <div class="streak"><b>🔥 ${s.current}</b><small>racha actual (${s.unit})</small></div>
          <div class="streak"><b>🏆 ${s.best}</b><small>mejor racha</small></div>
          ${g.freq === 'weekly' ? `<div class="streak"><b>${s.week}/${g.target}</b><small>esta semana</small></div>` : ''}
        </div>
        <div class="heat">${days.map((d) => `<div class="hc ${isDoneGoal(g, d) ? 'on' : ''} ${d === today ? 'today' : ''}" data-d="${d}" title="${DU.pretty(d)}${isDoneGoal(g, d) ? ' ✓' : ''}"></div>`).join('')}</div>
        <div class="heat-labels"><span>hace 4 semanas</span><span>hoy</span></div>
        <button class="btn ${doneToday ? '' : 'primary'}" data-a="today">${doneToday ? '✓ Cumplida hoy (deshacer)' : 'Marcar como cumplida hoy'}</button>
      </div>`);
      $$('.hc', card).forEach((c) => (c.onclick = () => toggleGoal(g.id, c.dataset.d)));
      $('[data-a=today]', card).onclick = () => toggleGoal(g.id, today);
      $('[data-a=edit]', card).onclick = () => openGoalModal(g);
      $('[data-a=del]', card).onclick = async () => {
        if (await confirmBox(`¿Eliminar la meta "${g.title}" y su historial?`, 'Eliminar', true)) {
          state.goals = state.goals.filter((x) => x !== g);
          delete state.goalLog[g.id];
          commit();
        }
      };
      if (g.id === 'biz' || g.ideas) {
        g.ideas = g.ideas || [];
        const box = el(`<div class="ideas"><b style="font-size:13px">Ideas de negocio</b>
          ${g.ideas.map((it, i) => `<div class="idea"><span>💡 ${esc(it)}</span><button class="icon-btn sm" data-i="${i}" title="Quitar">✕</button></div>`).join('') || '<div class="hint">Anota aquí tus ideas para no perderlas.</div>'}
          <form class="idea-form"><input type="text" placeholder="Nueva idea…"><button class="btn sm">Agregar</button></form>
          <button class="btn sm" data-a="plan">🗓️ Proponer tiempo esta semana</button></div>`);
        $$('[data-i]', box).forEach((b) => (b.onclick = () => { g.ideas.splice(+b.dataset.i, 1); commit(); }));
        $('form', box).onsubmit = (e) => {
          e.preventDefault();
          const v = $('input', box).value.trim();
          if (v) { g.ideas.push(v); commit(); }
        };
        $('[data-a=plan]', box).onclick = () => openPlanModal(null, { goal: g });
        card.appendChild(box);
      }
      grid.appendChild(card);
    });
    return wrap;
  }

  function openGoalModal(g) {
    const isNew = !g;
    const v = g ? { ...g } : { title: '', icon: '⭐', freq: 'daily', target: 3 };
    const m = openModal(`
      <div class="modal-head"><h2>${isNew ? 'Nueva meta' : 'Editar meta'}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">
        <div class="row"><label class="field" style="flex:0 0 80px"><span>Ícono</span><input type="text" id="gIcon" value="${esc(v.icon)}" maxlength="4"></label>
        <label class="field"><span>Meta</span><input type="text" id="gTitle" value="${esc(v.title)}" placeholder="Ej: Hacer ejercicio de respiración"></label></div>
        <div class="row"><label class="field"><span>Frecuencia</span><select id="gFreq"><option value="daily">Todos los días</option><option value="weekly">X veces por semana</option></select></label>
        <label class="field" id="gTargetWrap"><span>Veces por semana</span><input type="number" id="gTarget" min="1" max="7" value="${v.target || 3}"></label></div>
        <label class="field"><span>Nota (opcional)</span><input type="text" id="gNote" value="${esc(v.note || '')}"></label>
      </div>
      <div class="modal-foot"><span class="spacer"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="gSave">Guardar</button></div>`);
    const r = m.root;
    $('#gFreq', r).value = v.freq;
    const sync = () => { $('#gTargetWrap', r).style.visibility = $('#gFreq', r).value === 'weekly' ? 'visible' : 'hidden'; };
    $('#gFreq', r).onchange = sync; sync();
    $('#gSave', r).onclick = () => {
      const title = $('#gTitle', r).value.trim();
      if (!title) { $('#gTitle', r).focus(); return; }
      const data = { title, icon: $('#gIcon', r).value.trim() || '⭐', freq: $('#gFreq', r).value,
        target: Math.max(1, Math.min(7, +$('#gTarget', r).value || 1)), note: $('#gNote', r).value.trim() };
      if (isNew) state.goals.push({ id: uid(), ...data });
      else Object.assign(g, data);
      if (g && g.id === 'sleep') {
        const mm = title.match(/(\d{1,2})[:.](\d{2})/);
        if (mm) { let hh = +mm[1]; if (hh < 12) hh += 12; state.settings.bedtime = DU.toTime(hh * 60 + +mm[2]); }
      }
      m.close();
      commit();
    };
  }

  // ---------- Lateral ----------
  function renderSidebar() {
    const today = DU.today();
    const d = DU.parse(today);
    $('#todayTitle').textContent = `Hoy · ${DU.DAYS[d.getDay()]} ${d.getDate()} de ${DU.MONTHS[d.getMonth()]}`;
    const s = state.summary;
    if (!s || s.date !== today) $('#summaryText').textContent = AI.localSummary(state);
    else $('#summaryText').textContent = s.text;

    const tg = $('#todayGoals');
    tg.innerHTML = '';
    state.goals.forEach((g) => {
      const done = isDoneGoal(g, today);
      const st = streakOf(g);
      const row = el(`<div class="goal-row ${done ? 'done' : ''}"><span class="check">${done ? '✓' : ''}</span><span class="gi">${esc(g.icon)}</span>
        <span class="gt">${esc(g.title)}</span><span class="gs">${g.freq === 'weekly' ? `${st.week}/${g.target} sem` : `🔥 ${st.current}`}</span></div>`);
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
      .slice(0, 14);
    if (!list.length) up.innerHTML = '<div class="empty">Nada pendiente 🎉<br>Dile a Luna "tengo examen de…"</div>';
    list.forEach((e) => {
      const n = DU.diffDays(today, e.date);
      const cls = n <= 1 ? 'hot' : n <= 3 ? 'warm' : '';
      const kids = childrenOf(e.id);
      const needsPlan = (e.type === 'examen' || e.type === 'tarea') && !e.done && !kids.length && e.estMinutes;
      const color = e.subject && SUBJECTS[e.subject] ? SUBJECTS[e.subject].color : `var(--${e.type === 'examen' ? 'exam' : e.type === 'tarea' ? 'task' : e.type === 'meta' ? 'goal' : 'event'})`;
      const item = el(`<div class="up-item ${e.done ? 'done' : ''}">
        <span class="bar" style="background:${color}"></span>
        <div style="min-width:0;flex:1">
          <div class="ut">${TYPE[e.type].icon} ${esc(e.title)}</div>
          <div class="um">${DU.prettyShort(e.date)} ${e.start || ''}${e.importance ? ` · <span class="dots" title="Importancia ${e.importance}/5">${stars(e.importance)}</span>` : ''}</div>
          ${kids.length ? `<div class="um">🧠 ${kids.filter((k) => k.done).length}/${kids.length} sesiones</div>` : ''}
          ${needsPlan ? '<button class="link" data-plan>🧠 Proponer plan de estudio</button>' : ''}
        </div>
        <span class="when ${cls}">${n < 0 ? 'atrasada' : DU.relative(e.date)}</span>
      </div>`);
      item.onclick = () => openEventModal({ id: e.id });
      const pb = $('[data-plan]', item);
      if (pb) pb.onclick = (ev) => { ev.stopPropagation(); openPlanModal(e); };
      up.appendChild(item);
    });
  }

  async function refreshSummary(force = false) {
    const today = DU.today();
    if (!force && state.summary && state.summary.date === today) return;
    if (!state.settings.geminiKey) {
      state.summary = null;
      $('#summaryText').textContent = AI.localSummary(state);
      return;
    }
    const box = $('#summaryText');
    box.classList.add('loading');
    try {
      const text = await AI.dailySummaryAI(state);
      if (text) { state.summary = { date: today, text }; persist(); box.textContent = text; }
    } catch (e) {
      box.textContent = AI.localSummary(state);
      if (force) toast(e.message);
    } finally { box.classList.remove('loading'); }
  }

  // =========================================================
  //  Preguntas: importancia / dificultad / tiempo
  // =========================================================
  function questionsHTML(v) {
    const type = v.kind || v.type;
    const timeOpts = type === 'evento' ? [30, 60, 90, 120, 180, 240] : [30, 60, 90, 120, 180, 240, 360];
    const tLabel = type === 'evento' ? '¿Cuánto tiempo te ocupará ese día?' : type === 'tarea' ? '¿Cuánto tiempo te costará hacerla?' : '¿Cuánto tiempo necesitas para prepararlo?';
    const custom = v.estMinutes && !timeOpts.includes(v.estMinutes) ? String(+(v.estMinutes / 60).toFixed(2)) : '';
    return `<div class="questions">
      <div class="qh">🤔 Cuéntame un poco más ${v.estimated ? '<small>(Luna lo estimó — ajústalo si no es así)</small>' : ''}</div>
      <div class="q" data-q="importance"><label>¿Qué tan importante es?<em>${IMP[v.importance] || ''}</em></label>
        <div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" class="${v.importance === n ? 'sel' : ''}" title="${IMP[n]}">${n}</button>`).join('')}</div></div>
      <div class="q" data-q="difficulty"><label>¿Qué tan difícil es para ti?<em>${DIF[v.difficulty] || ''}</em></label>
        <div class="scale diff">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" class="${v.difficulty === n ? 'sel' : ''}" title="${DIF[n]}">${n}</button>`).join('')}</div></div>
      <div class="q" data-q="estMinutes"><label>${tLabel}<em>${v.estMinutes ? DU.fmtDur(v.estMinutes) : ''}</em></label>
        <div class="timechips">${timeOpts.map((n) => `<button type="button" data-v="${n}" class="${v.estMinutes === n ? 'sel' : ''}">${DU.fmtDur(n)}</button>`).join('')}
        <input type="number" min="0.25" step="0.25" placeholder="otro (h)" value="${custom}" title="Horas"></div></div>
    </div>`;
  }

  function bindQuestions(root, v, onChange) {
    const q = $('.questions', root);
    const rerender = () => {
      const fresh = el(questionsHTML(v));
      q.replaceWith(fresh);
      bindQuestions(root, v, onChange);
    };
    $$('.q', q).forEach((box) => {
      const key = box.dataset.q;
      $$('button', box).forEach((b) => (b.onclick = () => {
        v[key] = +b.dataset.v;
        v.estimated = false;
        onChange && onChange(key);
        rerender();
      }));
      const inp = $('input', box);
      if (inp) inp.onchange = () => {
        const hrs = parseFloat(inp.value);
        if (hrs > 0) { v[key] = Math.round(hrs * 60); v.estimated = false; onChange && onChange(key); rerender(); }
      };
    });
  }

  function missingQuestions(v) {
    const type = v.type || v.kind;
    if (type !== 'examen' && type !== 'tarea') return [];
    return ['importance', 'difficulty', 'estMinutes'].filter((k) => !v[k]);
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

    const subjOptions = `<option value="">— Ninguna —</option>` +
      Object.entries(SUBJECTS).map(([k, s]) => `<option value="${k}">${esc(s.name)}</option>`).join('');

    const m = openModal(`
      <div class="modal-head"><h2>${editing ? 'Editar' : 'Nuevo'}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">
        <div class="type-chips">${Object.entries(TYPE).map(([k, t]) => `<button type="button" data-t="${k}" class="t-${k}">${t.icon} ${t.label}</button>`).join('')}</div>
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
        <label class="field"><span>Notas / temas</span><textarea id="fNotes" rows="2" placeholder="Ej: entra capítulo 3 y 4, traer calculadora"></textarea></label>
        ${editing && editing.parentId && getEv(editing.parentId) ? `<div class="callout">🧠 Sesión del plan de <b>${esc(getEv(editing.parentId).title)}</b></div>` : ''}
      </div>
      <div class="modal-foot">
        ${editing ? '<button class="btn danger" id="fDel">Eliminar</button>' : ''}
        ${editing ? `<button class="btn" id="fDone">${editing.done ? '↩ No hecho' : '✓ Hecho'}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn" data-close>Cancelar</button>
        <button class="btn" id="fSave">Guardar</button>
        <button class="btn primary" id="fSavePlan">Guardar y planificar estudio</button>
      </div>`);
    const r = m.root;
    const f = { title: $('#fTitle', r), subject: $('#fSubject', r), date: $('#fDate', r), start: $('#fStart', r), end: $('#fEnd', r), notes: $('#fNotes', r) };
    f.title.value = v.title || '';
    f.subject.value = v.subject || '';
    f.date.value = v.date || DU.today();
    f.start.value = v.start || '';
    f.end.value = v.end || '';
    f.notes.value = v.notes || '';

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
        if (cls) hint.textContent = `📌 Ese día tienes ${SUBJECTS[v.subject].name} de ${cls.start} a ${cls.end}.`;
        else { hint.textContent = `⚠️ No tienes ${SUBJECTS[v.subject].name} el ${DU.pretty(v.date)}. Revisa la fecha.`; hint.className = 'hint warn'; }
      }
    };
    const syncType = () => {
      $$('.type-chips button', r).forEach((b) => b.classList.toggle('sel', b.dataset.t === v.type));
      $('#lblStart', r).textContent = v.type === 'tarea' ? 'Hora de entrega' : 'Hora';
      const wq = $('#qWrap', r);
      if (['examen', 'tarea', 'evento'].includes(v.type)) {
        wq.innerHTML = questionsHTML(v);
        bindQuestions(wq, v, (key) => {
          if (key === 'estMinutes' && v.type === 'evento' && f.start.value) {
            f.end.value = DU.toTime(DU.toMin(f.start.value) + v.estMinutes);
          }
        });
      } else wq.innerHTML = '';
      const planable = v.type === 'examen' || v.type === 'tarea';
      $('#fSavePlan', r).style.display = planable ? '' : 'none';
      $('#fSave', r).classList.toggle('primary', !planable);
      if (editing && planable && childrenOf(editing.id).length) $('#fSavePlan', r).textContent = 'Guardar y rehacer plan';
    };

    $$('.type-chips button', r).forEach((b) => (b.onclick = () => { v.type = b.dataset.t; autoTitle(); autoTime(); syncType(); }));
    f.title.oninput = () => { titleTouched = !!f.title.value.trim(); };
    f.subject.onchange = () => { v.subject = f.subject.value || null; autoTitle(); autoTime(); };
    f.date.onchange = () => { v.date = f.date.value; autoTime(); };
    f.start.onchange = () => {
      timeTouched = true;
      const dur = (DU.toMin(v.end) || 0) - (DU.toMin(v.start) || 0);
      v.start = f.start.value;
      if (v.start) { v.end = DU.toTime(DU.toMin(v.start) + (dur > 0 ? dur : 60)); f.end.value = v.end; }
    };
    f.end.onchange = () => { timeTouched = true; v.end = f.end.value; };

    syncType();
    if (!editing) { autoTitle(); autoTime(); }
    setTimeout(() => (editing || init.subject ? null : f.title.focus()), 50);

    const doSave = (plan) => {
      v.title = f.title.value.trim();
      v.date = f.date.value; v.start = f.start.value; v.end = f.end.value; v.notes = f.notes.value.trim();
      if (!v.title) {
        const s = v.subject && SUBJECTS[v.subject];
        v.title = s ? `${TYPE[v.type].label} de ${s.name}` : '';
      }
      if (!v.title) { f.title.focus(); toast('Ponle un título 🙂'); return; }
      if (!v.date) { f.date.focus(); return; }
      if (!v.start) { f.start.focus(); toast('Elige una hora'); return; }
      if (!v.end || DU.toMin(v.end) <= DU.toMin(v.start)) v.end = DU.toTime(DU.toMin(v.start) + 30);
      const miss = missingQuestions(v);
      if (miss.length) {
        miss.forEach((k) => { const q = $(`.q[data-q=${k}]`, r); q && q.classList.add('missing'); });
        toast('Responde las 3 preguntas 👇 así puedo planificar mejor');
        $('.questions', r).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      delete v.estimated;
      let ev;
      if (editing) { Object.assign(editing, v); ev = editing; }
      else ev = addEvent(v);
      m.close();
      commit();
      opts.onSaved && opts.onSaved(ev);
      if (plan) openPlanModal(ev);
      else if (!editing) {
        const acts = (ev.type === 'examen' || ev.type === 'tarea') ? [{ label: 'Planificar estudio', fn: () => openPlanModal(ev) }] : [];
        toast(`${TYPE[ev.type].icon} Guardado: ${ev.title}`, acts, 6000);
      }
    };
    $('#fSave', r).onclick = () => doSave(false);
    $('#fSavePlan', r).onclick = () => doSave(true);
    if (editing) {
      $('#fDel', r).onclick = async () => { m.close(); await deleteEvent(editing); };
      $('#fDone', r).onclick = () => { setDone(editing, !editing.done); m.close(); commit(); };
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

    const m = openModal(`
      <div class="modal-head"><h2>${isBiz ? '💡 Tiempo para tu negocio' : '🧠 Plan de estudio propuesto'}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">
        <div id="planInfo"></div>
        <div class="plan-list" id="planList"></div>
        <div><button class="btn sm" id="addRow">＋ Agregar sesión</button></div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="recalc">↻ Recalcular</button>
        <span class="spacer"></span>
        <button class="btn" data-close>Ahora no</button>
        <button class="btn primary" id="approve">Aprobar</button>
      </div>`, { wide: true });
    const r = m.root;

    const conflict = (s) => {
      const busy = P.busy(state, s.date, isBiz ? {} : { ignoreParent: ev.id });
      const a = DU.toMin(s.start), b = DU.toMin(s.end);
      const others = sessions.filter((x) => x !== s && x.include && x.date === s.date).map((x) => [DU.toMin(x.start), DU.toMin(x.end)]);
      const hit = [...busy, ...others].some(([x, y]) => a < y && b > x);
      const late = b > DU.toMin(state.settings.bedtime);
      return hit ? '⚠️ Choca con otra actividad' : late ? '🌙 Pasa tu hora de dormir' : '';
    };

    const render = () => {
      const inc = sessions.filter((s) => s.include);
      const total = inc.reduce((a, s) => a + (DU.toMin(s.end) - DU.toMin(s.start)), 0);
      let info = '';
      if (isBiz) {
        info = `<div class="callout">Bloques para <b>${esc(goal.title)}</b> en los próximos 7 días, solo en huecos que no le quitan tiempo al estudio. Total: <span class="plan-total">${DU.fmtDur(total)}</span>.</div>`;
      } else {
        info = `<div class="callout"><b>${esc(ev.title)}</b> · ${DU.pretty(ev.date)} ${ev.start || ''}<br>
          Importancia ${ev.importance || '?'}/5 · Dificultad ${ev.difficulty || '?'}/5 · Tiempo estimado ${DU.fmtDur(ev.estMinutes || 0)}<br>
          Seleccionado: <span class="plan-total">${DU.fmtDur(total)}</span> en ${inc.length} ${inc.length === 1 ? 'sesión' : 'sesiones'}. Cambia fechas u horas si quieres y aprueba.</div>`;
        if (existing.length) info += `<div class="callout warn">Al aprobar se reemplazan las ${existing.length} sesiones pendientes que ya tenías para este examen/tarea.</div>`;
      }
      if (result.note) info += `<div class="callout warn">${esc(result.note)}</div>`;
      $('#planInfo', r).innerHTML = info;

      const list = $('#planList', r);
      list.innerHTML = '';
      if (!sessions.length) list.innerHTML = '<div class="empty">No hay sesiones propuestas. Agrega una a mano.</div>';
      sessions.forEach((s, i) => {
        const c = conflict(s);
        const row = el(`<div class="plan-row ${s.include ? '' : 'off'}">
          <input type="checkbox" ${s.include ? 'checked' : ''} title="Incluir">
          <input type="date" value="${s.date}" min="${today}">
          <input type="time" value="${s.start}" class="ps">
          <input type="time" value="${s.end}" class="pe">
          <div class="pdesc"><div class="pt">${esc(s.title)}</div><div class="pd">${DU.prettyShort(s.date)} · ${DU.fmtDur(DU.toMin(s.end) - DU.toMin(s.start))} ${c ? '· ' + c : ''}</div></div>
        </div>`);
        const [chk, di, si, ei] = $$('input', row);
        chk.onchange = () => { s.include = chk.checked; render(); };
        di.onchange = () => { s.date = di.value; render(); };
        si.onchange = () => { const dur = DU.toMin(s.end) - DU.toMin(s.start); s.start = si.value; s.end = DU.toTime(DU.toMin(si.value) + dur); render(); };
        ei.onchange = () => { if (DU.toMin(ei.value) > DU.toMin(s.start)) s.end = ei.value; render(); };
        list.appendChild(row);
        row.dataset.i = i;
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
      sessions.push({ date: d, start: DU.toTime(s0), end: DU.toTime(s0 + 45), include: true,
        title: isBiz ? goal.title : `Estudiar: ${ev.title}` });
      render();
    };
    $('#approve', r).onclick = () => {
      const inc = sessions.filter((s) => s.include);
      if (existing.length) {
        const ids = new Set(existing.map((e) => e.id));
        state.events = state.events.filter((e) => !ids.has(e.id));
      }
      inc.forEach((s) => addEvent({
        type: isBiz ? 'meta' : 'estudio', title: s.title, date: s.date, start: s.start, end: s.end,
        subject: isBiz ? null : ev.subject, parentId: isBiz ? null : ev.id, goalId: isBiz ? goal.id : null,
        estMinutes: DU.toMin(s.end) - DU.toMin(s.start),
      }));
      m.close();
      commit();
      toast(`✅ ${inc.length} ${inc.length === 1 ? 'sesión agregada' : 'sesiones agregadas'} al calendario`);
      if (inc.length && ui.view === 'week') { ui.cursor = inc[0].date; ui.weekScroll = null; renderAll(); }
    };
  }

  // =========================================================
  //  Chat con la asistente
  // =========================================================
  const SUGGESTIONS = ['Tengo examen de mate el jueves', '¿Qué tengo esta semana?', 'Planifica mi estudio', 'Propón tiempo para mi negocio'];

  function renderChatStatus() {
    const s = $('#aiStatus');
    if (state.settings.geminiKey) { s.textContent = 'IA conectada (Gemini) ✓'; s.className = 'on'; s.style.cursor = ''; s.onclick = null; }
    else { s.textContent = 'modo básico · conectar IA gratis →'; s.className = ''; s.style.cursor = 'pointer'; s.onclick = () => openSettings('ai'); }
  }

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
      (msg.actions || []).forEach((a) => log.appendChild(renderActionCard(a, msg)));
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

  function resolveAction(a, status, note) {
    a.status = status;
    a.note = note;
    persist();
    renderChat();
  }

  function renderActionCard(a, msg) {
    const done = a.status && a.status !== 'pending';
    if (a.type === 'create_event') {
      const kind = TYPE[a.kind] ? a.kind : 'evento';
      a.kind = kind;
      const subj = a.subject && SUBJECTS[a.subject];
      const card = el(`<div class="action-card ${done ? 'resolved' : ''}">
        <div class="ah"><span class="tag t-${kind}">${TYPE[kind].label}</span><b>${esc(a.title)}</b></div>
        <div class="meta">📅 ${a.date ? DU.pretty(a.date) : '?'} · ${esc(a.start || '')}${a.end ? '–' + esc(a.end) : ''}${subj ? ' · ' + esc(subj.name) : ''}${a.notes ? '<br>📝 ' + esc(a.notes) : ''}</div>
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
      if (!ev) return el(`<div class="action-card resolved"><div class="meta">No encontré ese evento (quizá ya se borró).</div></div>`);
      let desc = '', btn = '';
      if (a.type === 'update_event') {
        const ch = a.changes || {};
        desc = Object.entries(ch).map(([k, val]) => `${k}: <b>${esc(val)}</b>`).join(' · ');
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
          if (ch.done != null) setDone(ev, !!ch.done);
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
          (state.goalLog[g.id] = state.goalLog[g.id] || {})[date] = true;
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
    renderChat();
    try {
      const res = await AI.ask(state, text);
      res.actions.forEach((a) => (a.status = a.type === 'check_goal' ? undefined : 'pending'));
      state.chat.push({ id: uid(), role: 'bot', text: res.reply || (res.actions.length ? 'Listo 👇' : '🤔'), actions: res.actions, at: Date.now() });
    } catch (e) {
      state.chat.push({ id: uid(), role: 'bot', text: '⚠️ ' + e.message, error: true, at: Date.now() });
    } finally {
      ui.chatBusy = false;
      persist();
      renderChat();
    }
  }

  // =========================================================
  //  Ajustes
  // =========================================================
  function openSettings(focus) {
    const st = state.settings;
    const routines = JSON.parse(JSON.stringify(state.routines));
    const noSchool = [...st.noSchoolDates];
    const notifState = !('Notification' in window) ? 'Tu navegador no soporta notificaciones.'
      : Notification.permission === 'granted' ? (st.notifications ? '✅ Activadas' : 'Permiso concedido, pero desactivadas')
        : Notification.permission === 'denied' ? '❌ Bloqueadas en el navegador (actívalas en el candado de la barra de direcciones)' : 'Aún no activadas';

    const m = openModal(`
      <div class="modal-head"><h2>⚙️ Ajustes</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body settings">
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
          <div class="hint">Luna nunca propone estudio en estos horarios. Después de cada actividad cuenta el camino y el almuerzo/baño.</div>
          <div id="routineList" style="display:flex;flex-direction:column;gap:6px"></div>
          <div><button class="btn sm" id="addRoutine">＋ Agregar actividad</button></div>
        </section>
        <section>
          <h4>🏫 Colegio</h4>
          <div class="row">
            <label class="field"><span>Último día de clases (opcional)</span><input type="date" id="sSchoolEnd" value="${st.schoolEnd}"></label>
            <label class="field"><span>Agregar día sin clases</span><div class="row"><input type="date" id="sNoSchool"><button class="btn sm" id="addNoSchool" style="flex:0">＋</button></div></label>
          </div>
          <div id="noSchoolList" class="type-chips"></div>
          <div class="hint">También puedes tocar 🏫 en la cabecera de cada día de la semana.</div>
        </section>
        <section>
          <h4>🔔 Recordatorios</h4>
          <div class="hint">Te aviso la noche anterior (19:00) y la mañana de cada examen/tarea, 10 min antes de cada sesión de estudio y a la hora de leer/dormir. Funciona mientras la app esté abierta en una pestaña.</div>
          <div class="row"><div class="hint" id="notifState">${notifState}</div><button class="btn" id="sNotif" style="flex:0">${st.notifications ? 'Desactivar' : 'Activar notificaciones'}</button></div>
        </section>
        <section>
          <h4>🎨 Apariencia</h4>
          <label class="field"><span>Tema</span><select id="sTheme"><option value="auto">Automático (como el sistema)</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
        </section>
        <section>
          <h4>💾 Tus datos</h4>
          <div class="hint">Todo se guarda en este navegador. Haz una copia de vez en cuando.</div>
          <div class="row-btns" style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn sm" id="sExport">⬇️ Exportar copia</button>
            <label class="btn sm">⬆️ Importar copia<input type="file" id="sImport" accept="application/json" hidden></label>
            <button class="btn sm danger" id="sReset">Borrar todo</button>
          </div>
        </section>
      </div>
      <div class="modal-foot"><span class="spacer"></span><button class="btn" data-close>Cancelar</button><button class="btn primary" id="sSave">Guardar</button></div>`, { wide: true });
    const r = m.root;
    $('#sTheme', r).value = st.theme;

    const DL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const renderRoutines = () => {
      const box = $('#routineList', r);
      box.innerHTML = '';
      routines.forEach((rt, i) => {
        const row = el(`<div class="routine-row">
          <input type="text" value="${esc((rt.icon ? rt.icon + ' ' : '') + rt.title)}">
          <div class="daypick">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-d="${d}" class="${rt.days.includes(d) ? 'sel' : ''}">${DL[d]}</button>`).join('')}</div>
          <input type="time" value="${rt.start}"><input type="time" value="${rt.end}">
          <button class="icon-btn sm" title="Quitar">✕</button></div>`);
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
        m.close(); commit(); renderChat(); applyTheme();
        toast('✅ Copia importada');
      } catch (err) { toast('❌ No se pudo importar: ' + err.message); }
    };
    $('#sReset', r).onclick = async () => {
      if (!(await confirmBox('¿Borrar TODOS tus eventos, metas y conversación? No se puede deshacer.', 'Borrar todo', true))) return;
      const key = state.settings.geminiKey;
      state = A.freshState();
      state.settings.geminiKey = key;
      m.close(); commit(); renderChat(); applyTheme();
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
      state.routines = routines.filter((x) => x.title && x.start && x.end && x.start < x.end && x.days.length);
      const sleep = state.goals.find((g) => g.id === 'sleep');
      if (sleep && /antes de las \d/.test(sleep.title)) sleep.title = `Dormir antes de las ${st.bedtime}`;
      applyTheme();
      m.close();
      state.summary = null;
      commit();
      refreshSummary(true);
      toast('Ajustes guardados');
    };
    if (focus === 'ai') setTimeout(() => $('#sKey', r).focus(), 50);
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
    const bed = DU.toMin(state.settings.bedtime);
    if (nm >= bed - 30 && nm < bed) once('bed', () => notify('📖 Hora de leer 10 min', `y luego a dormir antes de las ${state.settings.bedtime} 🌙`));
    // limpiar avisos viejos
    Object.keys(sent).forEach((k) => { if (k.slice(0, 10) < DU.addDays(today, -3)) delete sent[k]; });
  }

  // =========================================================
  //  Arranque
  // =========================================================
  function bind() {
    $$('.tab').forEach((t) => (t.onclick = () => { ui.view = t.dataset.view; ui.weekScroll = null; renderAll(); }));
    $$('[data-goto]').forEach((b) => (b.onclick = () => { ui.view = b.dataset.goto; renderAll(); }));
    const step = (dir) => {
      if (ui.view === 'week') ui.cursor = DU.addDays(ui.cursor, 7 * dir);
      else if (ui.view === 'month') { const d = DU.parse(ui.cursor); ui.cursor = DU.fmt(new Date(d.getFullYear(), d.getMonth() + dir, 1)); }
      renderAll();
    };
    $('#prevBtn').onclick = () => step(-1);
    $('#nextBtn').onclick = () => step(1);
    $('#todayBtn').onclick = () => { ui.cursor = DU.today(); ui.weekScroll = null; renderAll(); };
    $('#addBtn').onclick = () => openEventModal({});
    $('#settingsBtn').onclick = () => openSettings();
    $('#themeBtn').onclick = () => { state.settings.theme = isDark() ? 'light' : 'dark'; applyTheme(); persist(); };
    $('#refreshSummary').onclick = () => refreshSummary(true);
    $('#showDone').onchange = (e) => { ui.showDone = e.target.checked; renderSidebar(); };
    const app = $('#app');
    let chatHidden = false;
    try { chatHidden = localStorage.getItem('agenda-chat-hidden') === '1'; } catch (_) { /* nada */ }
    app.classList.toggle('chat-hidden', chatHidden);
    $('#chatToggle').onclick = () => {
      if (window.innerWidth <= 960) { app.classList.remove('chat-hidden'); app.classList.toggle('chat-open'); }
      else {
        app.classList.toggle('chat-hidden');
        try { localStorage.setItem('agenda-chat-hidden', app.classList.contains('chat-hidden') ? '1' : '0'); } catch (_) { /* nada */ }
      }
      if (!app.classList.contains('chat-hidden')) setTimeout(() => $('#chatInput').focus(), 50);
    };
    $('#closeChat').onclick = () => app.classList.remove('chat-open');
    $('#clearChat').onclick = async () => {
      if (state.chat.length && await confirmBox('¿Borrar la conversación con Luna? (tus eventos no se borran)', 'Borrar')) { state.chat = []; persist(); renderChat(); }
    };
    $('#chatForm').onsubmit = (e) => { e.preventDefault(); const i = $('#chatInput'); const t = i.value; i.value = ''; sendChat(t); };
    $('#chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); }
    });
    document.addEventListener('keydown', (e) => {
      if ($('#modalRoot').children.length || /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'n') { e.preventDefault(); openEventModal({}); }
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 't') $('#todayBtn').click();
      else if (e.key === '/') { e.preventDefault(); $('#chatInput').focus(); }
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.settings.theme === 'auto') applyTheme(); });
    window.addEventListener('storage', (e) => { if (e.key === 'agenda-raimondi-v1') { state = A.load(); renderAll(); renderChat(); } });
  }

  let lastDay = DU.today();
  function tick() {
    checkReminders();
    if (DU.today() !== lastDay) { lastDay = DU.today(); ui.cursor = lastDay; renderAll(); refreshSummary(); }
    else if (ui.view === 'week') {
      const line = $('.now-line');
      if (line) { const ppm = getPPM(); line.style.top = `${(DU.nowMin() - state.settings.calStart * 60) * ppm}px`; }
    }
  }

  applyTheme();
  bind();
  renderAll();
  renderChat();
  refreshSummary();
  tick();
  setInterval(tick, 30000);

  // para pruebas desde la consola
  window.__agenda = { get state() { return state; }, renderAll, openEventModal, openPlanModal };
})();

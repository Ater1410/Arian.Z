/* =========================================================
   today.js — vista "Hoy": pronóstico, ahora/siguiente, línea de tiempo y jefes
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { DU, SUBJECTS, classesOn, SCHOOL_START, SCHOOL_END } = window.Agenda;
  const P = window.Planner;
  const { $, $$, esc, el, icon } = App;

  let schoolOpen = false;

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  /** Pronóstico del día según la carga */
  function forecast(state, today) {
    const evs = state.events.filter((e) => e.date === today && !e.done);
    const studyMin = evs.filter((e) => e.type === 'estudio' || e.type === 'meta').reduce((s, e) => s + App.dur(e), 0);
    const examToday = evs.find((e) => e.type === 'examen');
    const examSoon = state.events.find((e) => e.type === 'examen' && !e.done && DU.diffDays(today, e.date) >= 1 && DU.diffDays(today, e.date) <= 2);
    const tasks = evs.filter((e) => e.type === 'tarea').length;
    const school = P.isSchoolDay(state, today);
    const sport = P.routinesOn(state, today).some((r) => /f[uú]tbol|gim|deporte|nataci/i.test(r.title));
    const score = studyMin / 60 + (examToday ? 3 : 0) + (examSoon ? 1 : 0) + tasks * 0.7 + (school ? 1 : 0) + (sport ? 0.5 : 0);
    const bits = [];
    if (examToday) bits.push(`examen hoy: ${App.shortTitle(examToday)}`);
    if (studyMin) bits.push(`${DU.fmtDur(studyMin)} de estudio`);
    if (tasks) bits.push(`${tasks} ${tasks === 1 ? 'tarea' : 'tareas'}`);
    if (examSoon) bits.push(`${App.shortTitle(examSoon)} ${DU.relative(examSoon.date)}`);
    if (!bits.length) bits.push(school ? 'solo clases y tu rutina' : 'día libre para descansar o avanzar tu negocio');
    if (score < 2) return { icon: '☀️', label: 'Día tranquilo', cls: 'sunny', text: bits.join(' · ') };
    if (score < 3.5) return { icon: '⛅', label: 'Día normal', cls: 'cloudy', text: bits.join(' · ') };
    if (score < 5) return { icon: '🌧️', label: 'Día cargado', cls: 'rainy', text: bits.join(' · ') };
    return { icon: '⛈️', label: 'Día de tormenta', cls: 'storm', text: bits.join(' · ') + ' — ¡paso a paso!' };
  }

  /** Construye los bloques del día (colegio, rutina, eventos, huecos, dormir) */
  function dayItems(state, d) {
    const items = [];
    const w = DU.dow(d);
    if (P.isSchoolDay(state, d)) {
      items.push({ kind: 'school', s: DU.toMin(SCHOOL_START), e: DU.toMin(SCHOOL_END), classes: classesOn(w) });
    }
    P.routinesOn(state, d).forEach((r) => items.push({ kind: 'routine', s: DU.toMin(r.start), e: DU.toMin(r.end), r }));
    state.events.filter((e) => e.date === d && e.start).forEach((ev) => items.push({ kind: 'event', s: DU.toMin(ev.start), e: DU.toMin(ev.end || ev.start) || DU.toMin(ev.start) + 30, ev }));
    if (d >= DU.today()) P.freeSlots(state, d).forEach(([a, b]) => items.push({ kind: 'free', s: a, e: b }));
    const bed = DU.toMin(state.settings.bedtime);
    if (state.goals.some((g) => g.id === 'read')) items.push({ kind: 'read', s: bed - 20, e: bed - 10 });
    items.push({ kind: 'bed', s: bed, e: bed });
    return items.sort((a, b) => a.s - b.s || (a.kind === 'free') - (b.kind === 'free'));
  }

  function labelOf(it) {
    const em = App.em;
    if (it.kind === 'school') return `${em('🏫')}Colegio`;
    if (it.kind === 'routine') return `${em(it.r.icon)}${it.r.title}`;
    if (it.kind === 'event') return `${em(App.TYPE[it.ev.type].icon)}${App.shortTitle(it.ev)}`;
    if (it.kind === 'free') return 'Tiempo libre';
    if (it.kind === 'read') return 'Leer 10 min';
    return 'A dormir';
  }

  function countdown(min) {
    if (min <= 0) return 'ahora';
    if (min < 60) return `en ${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return `en ${h} h${m ? ' ' + m + ' min' : ''}`;
  }

  function renderToday() {
    const state = App.state;
    const today = DU.today();
    const nm = DU.nowMin();
    const fc = forecast(state, today);
    const mood = App.lunaMood();
    const items = dayItems(state, today);

    // ahora / siguiente (sin huecos)
    const real = items.filter((i) => i.kind !== 'free' && i.kind !== 'bed');
    let now = real.find((i) => i.s <= nm && nm < i.e && i.kind !== 'school') || real.find((i) => i.s <= nm && nm < i.e);
    let nowClass = null;
    if (now && now.kind === 'school') nowClass = now.classes.find((c) => DU.toMin(c.start) <= nm && nm < DU.toMin(c.end));
    const minor = (i) => i.kind === 'routine' && /camino|almuerzo|cena|desayuno|ba[ñn]o/i.test(i.r.title);
    const next = items.find((i) => i.s > nm && i.kind !== 'free' && !minor(i)) || items.find((i) => i.s > nm && i.kind !== 'free');

    const wrap = el(`<div class="today-view">
      <section class="hero ${fc.cls}">
        <div class="hero-main">
          <div class="greet">${greeting()}</div>
          <h1>${DU.DAYS[DU.dow(today)]} ${DU.parse(today).getDate()} de ${DU.MONTHS[DU.parse(today).getMonth()]}</h1>
          <div class="forecast"><span class="fc-icon">${fc.icon}</span><div><b>${fc.label}</b><small>${esc(fc.text)}</small></div></div>
        </div>
        <div class="luna-says">
          <span class="luna-face">${mood.face}</span>
          <p id="lunaSays">${esc(App.summaryText())}</p>
          <button class="icon-btn sm" id="refreshSummary" title="Actualizar">${icon('refresh', 14)}</button>
        </div>
      </section>

      <section class="nownext">
        <div class="nn-card now">
          <small>AHORA</small>
          <b>${now ? esc(nowClass ? `${App.em(nowClass.icon)}${nowClass.name}` : labelOf(now)) : 'Nada en particular'}</b>
          <span>${now ? `${DU.toTime(nowClass ? DU.toMin(nowClass.start) : now.s)}–${DU.toTime(nowClass ? DU.toMin(nowClass.end) : now.e)} · termina ${countdown((nowClass ? DU.toMin(nowClass.end) : now.e) - nm)}` : 'Buen momento para un respiro'}</span>
          ${now ? `<div class="nn-prog"><i style="width:${Math.round((nm - (nowClass ? DU.toMin(nowClass.start) : now.s)) / Math.max(1, (nowClass ? DU.toMin(nowClass.end) - DU.toMin(nowClass.start) : now.e - now.s)) * 100)}%"></i></div>` : ''}
        </div>
        <div class="nn-card next">
          <small>LO SIGUIENTE</small>
          <b>${next ? esc(labelOf(next)) : 'Fin del día'}</b>
          <span>${next ? `${DU.toTime(next.s)} · <strong>${countdown(next.s - nm)}</strong>` : '¡Bien hecho hoy!'}</span>
          ${next && next.kind === 'event' && next.ev.type === 'estudio' ? `<button class="btn primary sm" id="startNext">${icon('play', 13)} Empezar</button>` : ''}
        </div>
      </section>

      <div class="today-grid">
        <section class="card timeline-card">
          <div class="card-head"><h3>Tu día</h3><button class="link" id="addToday">＋ agregar</button></div>
          <div class="timeline" id="timeline"></div>
        </section>
        <div class="today-side">
          <section class="card" id="resultsCard" hidden><div class="card-head"><h3>¿Cómo te fue?</h3></div><div id="results"></div></section>
          <section class="card bosses-card" id="bossSection">
            <div class="card-head"><h3>${App.G() ? '⚔️ Jefes a la vista' : 'Exámenes próximos'}</h3><button class="link" id="weeklyBtn">${icon('chart', 13)} Repaso semanal</button></div>
            <div id="bosses"></div>
          </section>
        </div>
      </div>
    </div>`);

    $('#refreshSummary', wrap).onclick = () => { $('#lunaSays', wrap).classList.add('loading'); App.refreshSummary(true).finally(() => $('#lunaSays', wrap) && $('#lunaSays', wrap).classList.remove('loading')); };
    $('#addToday', wrap).onclick = () => App.openEventModal({ date: today });
    $('#weeklyBtn', wrap).onclick = () => App.rituals.openWeeklyReview({ force: true });
    const sn = $('#startNext', wrap);
    if (sn) sn.onclick = () => App.openFocus(next.ev);

    // ----- línea de tiempo -----
    const tl = $('#timeline', wrap);
    let nowPlaced = false;
    const placeNow = () => {
      if (nowPlaced) return;
      nowPlaced = true;
      tl.appendChild(el(`<div class="tl-now"><span>${DU.toTime(nm)}</span><i></i><b>Estás aquí</b></div>`));
    };
    items.forEach((it) => {
      if (!nowPlaced && it.s > nm) placeNow();
      const past = it.e <= nm && it.kind !== 'bed';
      if (it.kind === 'free' && it.e - Math.max(it.s, nm) < 25) return;
      let node;
      if (it.kind === 'school') {
        node = el(`<div class="tl-item school ${past ? 'past' : ''}">
          <div class="tl-time">${DU.toTime(it.s)}<small>${DU.toTime(it.e)}</small></div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-title">${App.em('🏫')}Colegio <button class="link" data-toggle>${schoolOpen ? 'ocultar' : `ver ${it.classes.length} clases`}</button></div>
            <div class="bands-row">${it.classes.map((c) => `<span style="--c:${c.color};flex:${DU.toMin(c.end) - DU.toMin(c.start)}" title="${esc(c.name)} ${c.start}–${c.end}">${App.G() ? c.icon : ''}</span>`).join('')}</div>
            ${schoolOpen ? `<div class="class-list">${it.classes.map((c) => `<div class="cl ${DU.toMin(c.end) <= nm ? 'past' : ''} ${DU.toMin(c.start) <= nm && nm < DU.toMin(c.end) ? 'cur' : ''}" style="--c:${c.color}"><span>${c.start}</span><b>${App.G() ? c.icon + ' ' : ''}${esc(c.name)}</b><small>${esc(c.teacher)}</small></div>`).join('')}</div>` : ''}
          </div></div>`);
        $('[data-toggle]', node).onclick = () => { schoolOpen = !schoolOpen; App.renderView(); };
      } else if (it.kind === 'routine') {
        node = el(`<div class="tl-item routine ${past ? 'past' : ''}"><div class="tl-time">${DU.toTime(it.s)}</div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-title">${esc(labelOf(it))}</div><small>${DU.toTime(it.s)}–${DU.toTime(it.e)}</small></div></div>`);
      } else if (it.kind === 'event') {
        const ev = it.ev;
        const s = App.subjOf(ev);
        node = el(`<div class="tl-item event t-${ev.type} ${past ? 'past' : ''} ${ev.done ? 'done' : ''}" style="${s ? `--sc:${s.color}` : ''}">
          <div class="tl-time">${ev.start}<small>${ev.end || ''}</small></div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-title">${App.badge(ev)}${esc(ev.title)}</div>
            ${ev.notes ? `<small>${esc(ev.notes)}</small>` : ''}</div>
          <div class="tl-actions">
            ${ev.type === 'estudio' && !ev.done ? `<button class="icon-btn sm" data-focus title="Modo concentración">${icon('play', 14)}</button>` : ''}
            <button class="check-btn ${ev.done ? 'on' : ''}" data-done title="${ev.done ? 'Marcar como no hecho' : 'Marcar como hecho'}">${icon('check', 14)}</button>
          </div></div>`);
        node.onclick = () => App.openEventModal({ id: ev.id });
        $('[data-done]', node).onclick = (e) => { e.stopPropagation(); App.markDone(ev, !ev.done); App.commit(); };
        const fb = $('[data-focus]', node);
        if (fb) fb.onclick = (e) => { e.stopPropagation(); App.openFocus(ev); };
      } else if (it.kind === 'free') {
        const a = Math.max(it.s, Math.ceil(nm / 5) * 5);
        node = el(`<div class="tl-item free"><div class="tl-time">${DU.toTime(a)}</div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-title">Libre · ${DU.fmtDur(it.e - a)}</div><small>Toca para usar este tiempo</small></div></div>`);
        node.onclick = () => App.openEventModal({ date: today, type: 'evento', start: DU.toTime(a), end: DU.toTime(Math.min(it.e, a + 60)) });
      } else if (it.kind === 'read') {
        const g = state.goals.find((x) => x.id === 'read');
        const done = g && App.isDoneGoal(g, today);
        node = el(`<div class="tl-item ritual ${done ? 'done' : ''}"><div class="tl-time">${DU.toTime(it.s)}</div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-title">Leer 10 minutos ${done ? '✓' : ''}</div><small>${done ? '¡Hecho!' : 'Toca para empezar con temporizador'}</small></div></div>`);
        node.onclick = () => App.rituals.openReading({ force: true });
      } else {
        node = el(`<div class="tl-item bed"><div class="tl-time">${DU.toTime(it.s)}</div><div class="tl-dot"></div>
          <div class="tl-body"><div class="tl-title">A dormir</div><small>Meta: dormir antes de las ${state.settings.bedtime}</small></div></div>`);
      }
      tl.appendChild(node);
    });
    placeNow();

    // ----- resultados pendientes -----
    const pend = App.pendingResults();
    if (pend.length) {
      $('#resultsCard', wrap).hidden = false;
      const box = $('#results', wrap);
      pend.slice(0, 3).forEach((ev) => {
        const v = { grade: null, prepFeel: null };
        const card = el(`<div class="result-card"><b>${App.badge(ev)} ${esc(ev.title)}</b><small>${DU.prettyShort(ev.date)} · ${DU.relative(ev.date)}</small>
          ${App.resultHTML(v)}<div class="row-btns"><button class="btn primary sm" data-save>Guardar</button><button class="btn sm ghost" data-skip>Omitir</button></div></div>`);
        $('.result-box .qh', card).remove();
        App.bindResult(card, v);
        $('[data-save]', card).onclick = () => {
          if (!App.saveResult(ev, v)) { App.toast('Pon tu nota o cómo te fue con el tiempo'); return; }
          App.commit();
          App.toast(v.prepFeel === 'poco' ? '📚 Anotado: la próxima vez te propondré más tiempo para esta materia' : '✅ ¡Anotado!');
        };
        $('[data-skip]', card).onclick = () => { ev.resultDone = true; ev.done = true; App.commit(); };
        box.appendChild(card);
      });
    }

    // ----- jefes -----
    const bx = $('#bosses', wrap);
    const bosses = App.activeBosses().slice(0, 5);
    if (!bosses.length) bx.innerHTML = App.G()
      ? '<div class="empty big">🕊️ No hay jefes a la vista.<br><small>Cuando anotes un examen, aparecerá aquí como un monstruo. Cada sesión de estudio le quita vida.</small></div>'
      : '<div class="empty big">Sin exámenes próximos.<br><small>Cuando anotes uno verás aquí cuánto te has preparado.</small></div>';
    if (!App.G()) {
      bosses.forEach((b) => {
        const ev = b.ev;
        const s = App.subjOf(ev);
        const n = DU.diffDays(today, ev.date);
        const row = el(`<div class="exam-row" style="--sc:${s ? s.color : 'var(--accent)'}">
          <div class="er-main">
            <div class="er-top">${App.badge(ev)}<b>${esc(App.shortTitle(ev))}</b><span class="when ${n <= 1 ? 'hot' : ''}">${DU.relative(ev.date)}</span></div>
            <small>${DU.prettyShort(ev.date)} · ${ev.start || ''} · ${b.sessions ? `${b.sessionsDone}/${b.sessions} sesiones` : 'sin plan'}</small>
            <div class="hp prep"><i style="width:${b.prep}%"></i></div>
            <small class="er-pct">${b.prep}% preparado · faltan ${DU.fmtDur(b.hp)}</small>
          </div>
          <div class="er-actions">
            <button class="btn sm" data-attack>${icon('play', 12)} Estudiar</button>
            ${b.sessions ? '' : '<button class="btn sm ghost" data-plan>Plan</button>'}
          </div></div>`);
        $('[data-attack]', row).onclick = () => App.openFocus(b.nextSession && b.nextSession.date === today ? b.nextSession : ev);
        const pb = $('[data-plan]', row);
        if (pb) pb.onclick = () => App.openPlanModal(ev);
        $('.er-main', row).onclick = () => App.openEventModal({ id: ev.id });
        bx.appendChild(row);
      });
      return wrap;
    }
    bosses.forEach((b) => {
      const ev = b.ev;
      const s = App.subjOf(ev);
      const n = DU.diffDays(today, ev.date);
      const card = el(`<div class="boss" style="--sc:${s ? s.color : 'var(--accent)'}">
        <div class="boss-face" style="font-size:${26 + Math.min(4, Math.ceil(b.power / 6)) * 6}px">${b.face}</div>
        <div class="boss-info">
          <div class="boss-name"><b>${esc(b.name)}</b><span class="when ${n <= 1 ? 'hot' : n <= 3 ? 'warm' : ''}">${DU.relative(ev.date)}</span></div>
          <small>${esc(ev.title)} · ${DU.prettyShort(ev.date)} ${ev.start || ''}</small>
          <div class="hp"><i style="width:${b.pct}%"></i></div>
          <div class="boss-meta"><span>❤️ ${DU.fmtDur(b.hp)} / ${DU.fmtDur(b.maxHP)}</span><span>${b.sessions ? `🧠 ${b.sessionsDone}/${b.sessions} sesiones` : 'sin plan'}</span></div>
        </div>
        <div class="boss-actions">
          <button class="btn primary sm" data-attack>${icon('sword', 14)} Atacar</button>
          ${b.sessions ? '' : '<button class="btn sm" data-plan>Plan</button>'}
        </div></div>`);
      $('[data-attack]', card).onclick = () => App.openFocus(b.nextSession && b.nextSession.date === today ? b.nextSession : ev);
      const pb = $('[data-plan]', card);
      if (pb) pb.onclick = () => App.openPlanModal(ev);
      card.querySelector('.boss-info').onclick = () => App.openEventModal({ id: ev.id });
      bx.appendChild(card);
    });
    return wrap;
  }

  App.views.today = renderToday;
  App.dayItems = dayItems;
})();

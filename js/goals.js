/* =========================================================
   goals.js — metas como cielo nocturno:
   constelaciones (lectura y metas propias), fases de la luna (sueño)
   y una plantita que crece (negocio)
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { DU, uid } = window.Agenda;
  const { $, $$, esc, el, icon } = App;

  const DAYS = 28;
  const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕'];
  const PLANTS = [
    { min: 0, face: '🌰', name: 'Semilla' },
    { min: 1, face: '🌱', name: 'Brote' },
    { min: 3, face: '🌿', name: 'Plantita' },
    { min: 6, face: '🪴', name: 'Planta' },
    { min: 10, face: '🌳', name: 'Árbol' },
  ];

  const kindOf = (g) => (g.id === 'sleep' || /dorm/i.test(g.title)) ? 'moon'
    : (g.id === 'biz' || /negocio/i.test(g.title)) ? 'plant' : 'stars';

  // generador pseudoaleatorio con semilla (posiciones de estrellas estables)
  function rng(seed) {
    let s = 0;
    for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function constellation(g, days) {
    const W = 560, H = 150;
    const rnd = rng(g.id + 'sky');
    const pts = days.map((d, i) => ({
      d, x: 18 + i * ((W - 36) / (days.length - 1)) + (rnd() - 0.5) * 10,
      y: 22 + rnd() * (H - 44), on: App.isDoneGoal(g, d), today: d === DU.today(),
    }));
    let lines = '';
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].on && pts[i - 1].on) lines += `<line x1="${pts[i - 1].x}" y1="${pts[i - 1].y}" x2="${pts[i].x}" y2="${pts[i].y}"/>`;
    }
    const stars = pts.map((p) => `<g class="star ${p.on ? 'on' : ''} ${p.today ? 'today' : ''}" data-d="${p.d}">
      <title>${DU.pretty(p.d)}${p.on ? ' ✓' : ''}</title>
      <circle class="hit" cx="${p.x}" cy="${p.y}" r="11"/>
      ${p.on ? `<circle class="glow" cx="${p.x}" cy="${p.y}" r="8"/><path class="sparkle" transform="translate(${p.x} ${p.y})" d="M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4Z"/>` : `<circle class="dim" cx="${p.x}" cy="${p.y}" r="2.2"/>`}
      ${p.today ? `<circle class="ring" cx="${p.x}" cy="${p.y}" r="10"/>` : ''}
    </g>`).join('');
    return `<svg class="constellation" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Constelación de los últimos ${DAYS} días"><g class="lines">${lines}</g>${stars}</svg>`;
  }

  function moonRow(g, days) {
    return `<div class="moons">${days.slice(-14).map((d) => `<button class="moon-day ${d === DU.today() ? 'today' : ''}" data-d="${d}" title="${DU.pretty(d)}">
      <span>${App.isDoneGoal(g, d) ? '🌕' : '🌑'}</span><small>${DU.DAYS_SHORT[DU.dow(d)][0]}</small></button>`).join('')}</div>`;
  }

  function plantStage(g) {
    const today = DU.today();
    let done = 0;
    for (let i = 0; i < DAYS; i++) if (App.isDoneGoal(g, DU.addDays(today, -i))) done++;
    const score = done + Math.floor((g.ideas || []).length / 2);
    let st = PLANTS[0];
    PLANTS.forEach((p) => { if (score >= p.min) st = p; });
    const next = PLANTS[PLANTS.indexOf(st) + 1];
    return { ...st, score, next };
  }

  function renderGoals() {
    const state = App.state;
    const today = DU.today();
    const days = [...Array(DAYS)].map((_, i) => DU.addDays(today, i - DAYS + 1));
    const wrap = el(`<div class="goals-view">
      <div class="sky">
        <div class="sky-stars"></div>
        <div class="goals-top"><div><h2>Tu cielo de metas ✨</h2><div class="hint">Cada día que cumples algo, se enciende una estrella. Toca cualquier día para marcarlo o desmarcarlo.</div></div>
        <button class="btn primary" id="addGoal">${icon('plus', 16)} Nueva meta</button></div>
        <div class="goals-grid"></div>
      </div></div>`);
    $('#addGoal', wrap).onclick = () => openGoalModal();
    const grid = $('.goals-grid', wrap);

    state.goals.forEach((g) => {
      const s = App.streakOf(g);
      const kind = kindOf(g);
      const doneToday = App.isDoneGoal(g, today);
      let visual = '';
      if (kind === 'moon') {
        const phase = s.current >= 4 ? 4 : s.current;
        visual = `<div class="moon-big ${s.current >= 7 ? 'full' : ''}"><span>${MOONS[phase]}</span>
          <div><b>${s.current >= 7 ? '¡Luna llena! 🌟' : s.current >= 4 ? 'Casi luna llena' : 'Luna creciente'}</b>
          <small>${s.current >= 7 ? `${s.current} noches seguidas durmiendo temprano` : `Cada noche que duermes temprano la luna crece. Llena a los 7 días (${s.current}/7).`}</small></div></div>
          ${moonRow(g, days)}`;
      } else if (kind === 'plant') {
        const p = plantStage(g);
        g.ideas = g.ideas || [];
        visual = `<div class="plant-scene"><div class="plant ${doneToday ? 'happy' : ''}">${p.face}</div>
          <div class="plant-info"><b>${p.name}</b><small>${p.next ? `Riégala avanzando tu negocio y anotando ideas. Siguiente etapa: ${p.next.face} ${p.next.name}` : '¡Tu negocio es un árbol fuerte! 🌳'}</small>
          <div class="week-dots">${[...Array(7)].map((_, i) => { const d = DU.addDays(DU.startOfWeek(today), i); return `<span class="${App.isDoneGoal(g, d) ? 'on' : ''} ${d === today ? 'today' : ''}" data-d="${d}" title="${DU.pretty(d)}">${DU.DAYS_SHORT[DU.dow(d)][0]}</span>`; }).join('')}</div></div></div>
          <div class="leaves">${g.ideas.map((it, i) => `<span class="leaf">🍃 ${esc(it)}<button data-i="${i}" title="Quitar">✕</button></span>`).join('') || '<span class="hint">Cada idea que anotas es una hoja nueva 🍃</span>'}</div>
          <form class="idea-form"><input type="text" placeholder="Nueva idea de negocio…"><button class="btn sm">Agregar hoja</button></form>`;
      } else {
        visual = constellation(g, days) + '<div class="heat-labels"><span>hace 4 semanas</span><span>hoy</span></div>';
      }

      const card = el(`<div class="goal-card k-${kind}">
        <div class="gh"><span class="gi">${esc(g.icon)}</span>
          <div><b>${esc(g.title)}</b><small>${g.freq === 'daily' ? 'Todos los días' : `${g.target} ${g.target === 1 ? 'vez' : 'veces'} por semana`}${g.optional ? ' · si hay tiempo' : ''}</small></div>
          <div class="actions"><button class="icon-btn sm" data-a="edit" title="Editar">✏️</button><button class="icon-btn sm" data-a="del" title="Eliminar">${icon('trash', 14)}</button></div>
        </div>
        ${visual}
        <div class="streaks">
          <div class="streak"><b>🔥 ${s.current}</b><small>racha (${s.unit})</small></div>
          <div class="streak"><b>🏆 ${s.best}</b><small>mejor racha</small></div>
          ${g.freq === 'weekly' ? `<div class="streak"><b>${s.week}/${g.target}</b><small>esta semana</small></div>` : `<div class="streak"><b>⭐ ${s.total}</b><small>en total</small></div>`}
        </div>
        <div class="goal-btns">
          <button class="btn ${doneToday ? '' : 'primary'}" data-a="today">${doneToday ? '✓ Cumplida hoy' : 'Marcar hoy'}</button>
          ${kind === 'plant' ? '<button class="btn" data-a="plan">🗓️ Proponer tiempo</button>' : ''}
          ${g.id === 'read' ? `<button class="btn" data-a="read">${icon('play', 13)} Leer con temporizador</button>` : ''}
        </div>
      </div>`);
      $$('[data-d]', card).forEach((c) => (c.onclick = () => App.toggleGoal(g.id, c.dataset.d)));
      $('[data-a=today]', card).onclick = () => App.toggleGoal(g.id, today);
      $('[data-a=edit]', card).onclick = () => openGoalModal(g);
      $('[data-a=del]', card).onclick = async () => {
        if (await App.confirmBox(`¿Eliminar la meta "${g.title}" y su historial?`, 'Eliminar', true)) {
          state.goals = state.goals.filter((x) => x !== g);
          delete state.goalLog[g.id];
          App.commit();
        }
      };
      const pb = $('[data-a=plan]', card);
      if (pb) pb.onclick = () => App.openPlanModal(null, { goal: g });
      const rb = $('[data-a=read]', card);
      if (rb) rb.onclick = () => App.rituals.openReading({ force: true });
      if (kind === 'plant') {
        $$('.leaf button', card).forEach((b) => (b.onclick = () => { g.ideas.splice(+b.dataset.i, 1); App.commit(); }));
        $('form', card).onsubmit = (e) => {
          e.preventDefault();
          const v = $('form input', card).value.trim();
          if (v) { g.ideas.push(v); App.commit(); App.toast('🍃 ¡Nueva hoja en tu plantita!'); }
        };
      }
      grid.appendChild(card);
    });
    if (!state.goals.length) grid.appendChild(el('<div class="empty big">Tu cielo está vacío. Crea una meta para encender la primera estrella ⭐</div>'));
    return wrap;
  }

  function openGoalModal(g) {
    const state = App.state;
    const isNew = !g;
    const v = g ? { ...g } : { title: '', icon: '⭐', freq: 'daily', target: 3 };
    const m = App.openModal(`
      <div class="modal-head"><h2>${isNew ? 'Nueva meta' : 'Editar meta'}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="modal-body">
        <div class="row"><label class="field" style="flex:0 0 80px"><span>Ícono</span><input type="text" id="gIcon" value="${esc(v.icon)}" maxlength="4"></label>
        <label class="field"><span>Meta</span><input type="text" id="gTitle" value="${esc(v.title)}" placeholder="Ej: Tomar 2 litros de agua"></label></div>
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
      App.commit();
    };
  }

  App.views.goals = renderGoals;
})();

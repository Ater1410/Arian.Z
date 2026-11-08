/* =========================================================
   rituals.js — rituales del día:
   · noche: lectura de 10 min con temporizador y "buenas noches"
   · mañana: "¿dormiste temprano?" con un toque
   · domingo: repaso de la semana
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { DU } = window.Agenda;
  const AI = window.AI;
  const FX = window.FX;
  const { $, esc, el, icon } = App;

  const busy = () => $('#modalRoot').children.length || $('.focus-ov') || $('.tour') || $('.night-ov');

  // ---------- Noche: leer 10 min ----------
  function shouldRead() {
    const st = App.state.settings;
    if (!st.nightMode || st.nightShown === DU.today()) return false;
    const g = App.state.goals.find((x) => x.id === 'read');
    if (g && App.isDoneGoal(g, DU.today())) return false;
    const nm = DU.nowMin(), bed = DU.toMin(st.bedtime);
    return nm >= bed - 30 && nm < bed + 90;
  }

  function openReading({ force = false } = {}) {
    if ($('.night-ov')) return Promise.resolve();
    const st = App.state.settings;
    st.nightShown = DU.today();
    App.persist();
    const g = App.state.goals.find((x) => x.id === 'read');
    const already = g && App.isDoneGoal(g, DU.today());
    return new Promise((resolve) => {
      const ov = el(`<div class="night-ov"><div class="sky-stars"></div>
        <div class="night-card">
          <div class="night-moon">🌙</div>
          <h2>${already && !force ? 'Buenas noches' : 'Hora de leer 📖'}</h2>
          <p id="nText">${already ? 'Ya leíste hoy. ¿Otra ronda de 10 minutos?' : `10 minutos de lectura y luego a dormir antes de las ${esc(st.bedtime)}. Deja el celular lejos.`}</p>
          <div class="night-timer" id="nTimer" hidden><b>10:00</b><div class="hp"><i style="width:100%"></i></div></div>
          <div class="row-btns center" id="nBtns">
            <button class="btn primary" id="nStart">${icon('play', 14)} Empezar a leer</button>
            <button class="btn ghost light" id="nLater">Ahora no</button>
          </div>
        </div></div>`);
      document.body.appendChild(ov);
      let timer = null;
      const close = () => { clearInterval(timer); ov.classList.add('out'); setTimeout(() => ov.remove(), 250); resolve(); };
      $('#nLater', ov).onclick = close;
      $('#nStart', ov).onclick = () => {
        const end = Date.now() + 10 * 60000;
        $('#nTimer', ov).hidden = false;
        $('#nBtns', ov).innerHTML = '<button class="btn ghost light" id="nStop">Terminé antes</button>';
        $('#nText', ov).textContent = 'Disfruta tu libro. Te aviso cuando pasen los 10 minutos.';
        const done = () => {
          clearInterval(timer);
          if (g) App.setGoal(g.id, DU.today(), true);
          App.commit();
          FX.chime('end');
          $('.night-moon', ov).textContent = '😴';
          $('h2', ov).textContent = '¡Buenas noches! 🌙';
          $('#nText', ov).textContent = `Meta de lectura cumplida ✓. Ahora a dormir antes de las ${st.bedtime}. Mañana te pregunto cómo te fue.`;
          $('#nTimer', ov).hidden = true;
          $('#nBtns', ov).innerHTML = '<button class="btn primary" id="nBye">Buenas noches</button>';
          $('#nBye', ov).onclick = close;
        };
        $('#nStop', ov).onclick = done;
        timer = setInterval(() => {
          const left = Math.max(0, end - Date.now());
          const s = Math.ceil(left / 1000);
          $('#nTimer b', ov).textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
          $('#nTimer i', ov).style.width = `${left / 6000}%`;
          if (left <= 0) done();
        }, 250);
      };
    });
  }

  // ---------- Mañana: ¿dormiste temprano? ----------
  function shouldAskSleep() {
    const st = App.state.settings;
    const g = App.state.goals.find((x) => x.id === 'sleep');
    if (!g || st.sleepAsked === DU.today()) return false;
    const y = DU.addDays(DU.today(), -1);
    if (App.isDoneGoal(g, y)) return false;
    const nm = DU.nowMin();
    return nm >= 5 * 60 && nm < DU.toMin(st.bedtime) - 30;
  }
  function askSleep() {
    return new Promise((resolve) => {
      const st = App.state.settings;
      const g = App.state.goals.find((x) => x.id === 'sleep');
      const y = DU.addDays(DU.today(), -1);
      const m = App.openModal(`
        <div class="modal-body center-body">
          <div class="big-emoji">🌅</div>
          <h2>${DU.nowMin() < 12 * 60 ? '¡Buenos días!' : '¡Hola de nuevo!'}</h2>
          <p>Anoche (${DU.pretty(y)}), ¿dormiste antes de las <b>${esc(st.bedtime)}</b>?</p>
          <div class="row-btns center">
            <button class="btn primary big" id="sYes">🌕 ¡Sí!</button>
            <button class="btn big" id="sNo">🌑 No</button>
          </div>
          <small class="hint">Tu respuesta hace crecer tu luna en Metas.</small>
        </div>`, { cls: 'narrow', onClose: () => { st.sleepAsked = DU.today(); App.persist(); resolve(); } });
      $('#sYes', m.root).onclick = () => {
        App.setGoal(g.id, y, true); m.close(); App.commit();
        const s = App.streakOf(g);
        FX.chime('ok');
        App.toast(s.current >= 7 ? '🌕 ¡Luna llena! 7 noches seguidas' : `🌙 ¡Bien! Racha de ${s.current} ${s.current === 1 ? 'noche' : 'noches'}`);
      };
      $('#sNo', m.root).onclick = () => { m.close(); App.toast('Hoy es otra oportunidad 💪 Te recordaré a la hora de leer'); };
    });
  }

  // ---------- Domingo: repaso de la semana ----------
  function reviewWeek() {
    const today = DU.today();
    const w = DU.dow(today);
    if (w === 0) return DU.startOfWeek(today);
    if (w === 1) return DU.addDays(DU.startOfWeek(today), -7);
    return null;
  }
  function shouldWeekly() {
    const ws = reviewWeek();
    if (!ws) return false;
    if (DU.dow(DU.today()) === 0 && DU.nowMin() < 12 * 60) return false;
    if (App.state.settings.weeklyDone === ws) return false;
    const we = DU.addDays(ws, 6);
    const st = App.state;
    const logs = Object.values(st.goalLog).reduce((n, l) => n + Object.keys(l).filter((d) => d >= ws && d <= we).length, 0);
    return st.events.some((e) => e.date >= ws && e.date <= we) || logs >= 3;
  }

  function weekStats(ws) {
    const st = App.state;
    const we = DU.addDays(ws, 6);
    const evs = st.events.filter((e) => e.date >= ws && e.date <= we);
    const sessions = evs.filter((e) => e.type === 'estudio');
    const studyMin = sessions.reduce((s, e) => s + (e.done ? App.dur(e) : (e.focusMinutes || 0)), 0)
      + evs.filter((e) => e.type !== 'estudio').reduce((s, e) => s + (e.focusMinutes || 0), 0);
    const exams = evs.filter((e) => e.type === 'examen');
    const defeated = exams.filter((e) => App.bossOf(e).hp === 0).length;
    const goals = st.goals.map((g) => ({ g, n: App.weekCount(g, ws) }));
    const nextWs = DU.addDays(ws, 7);
    const upcoming = st.events.filter((e) => (e.type === 'examen' || e.type === 'tarea') && !e.done && e.date >= DU.today() && e.date <= DU.addDays(nextWs, 6))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { ws, we, studyMin, sessionsDone: sessions.filter((e) => e.done).length, sessions: sessions.length, exams, defeated, goals, upcoming };
  }

  function localWeekMsg(s) {
    const parts = [];
    if (s.studyMin) parts.push(`Estudiaste ${DU.fmtDur(s.studyMin)} esta semana`);
    else parts.push('Esta semana casi no hubo estudio planificado');
    const best = s.goals.slice().sort((a, b) => b.n - a.n)[0];
    if (best && best.n) parts.push(`tu meta más constante fue "${best.g.title}" (${best.n} días)`);
    let msg = parts.join(' y ') + '.';
    if (s.defeated) msg += ` Derrotaste ${s.defeated} ${s.defeated === 1 ? 'jefe' : 'jefes'} ⚔️.`;
    if (s.upcoming.length) msg += ` Lo que viene: ${s.upcoming.slice(0, 2).map((e) => App.shortTitle(e)).join(' y ')}. ¡Planifícalo hoy y la semana será más tranquila!`;
    else msg += ' La próxima semana se ve tranquila: buen momento para tu negocio 🌱';
    return msg;
  }

  function openWeeklyReview({ force = false } = {}) {
    const ws = reviewWeek() || DU.startOfWeek(DU.today());
    const s = weekStats(ws);
    return new Promise((resolve) => {
      const goalsHTML = s.goals.map(({ g, n }) => {
        const target = g.freq === 'daily' ? 7 : g.target;
        return `<div class="wr-goal"><span>${esc(g.icon)}</span><b>${esc(g.title)}</b><div class="hp good"><i style="width:${Math.min(100, Math.round(n / target * 100))}%"></i></div><small>${n}/${target}</small></div>`;
      }).join('');
      const examsHTML = s.exams.length ? s.exams.map((e) => `<div class="wr-row">${App.badge(e)} ${esc(e.title)} <small>${e.grade != null ? `nota ${e.grade}` : App.bossOf(e).hp === 0 ? '⚔️ derrotado' : ''}</small></div>`).join('') : '<div class="hint">Sin exámenes esta semana.</div>';
      const nextHTML = s.upcoming.length ? s.upcoming.map((e) => {
        const planned = App.childrenOf(e.id).length;
        return `<div class="wr-row">${App.badge(e)} <b>${esc(App.shortTitle(e))}</b> <small>${DU.prettyShort(e.date)}</small>
          ${planned ? '<span class="pill ok">plan listo</span>' : `<button class="btn sm" data-plan="${e.id}">Planificar</button>`}</div>`;
      }).join('') : '<div class="hint">Nada anotado todavía para la próxima semana.</div>';

      const m = App.openModal(`
        <div class="modal-head"><h2>📊 Repaso de la semana</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
        <div class="modal-body">
          <div class="hint">${DU.prettyShort(s.ws)} – ${DU.prettyShort(s.we)}</div>
          <div class="wr-stats">
            <div><b>${DU.fmtDur(s.studyMin)}</b><small>de estudio</small></div>
            <div><b>${s.sessionsDone}/${s.sessions}</b><small>sesiones</small></div>
            <div><b>${s.defeated}</b><small>jefes derrotados</small></div>
          </div>
          <div class="luna-note"><span class="luna-face">${App.lunaMood().face}</span><p id="wrMsg">${esc(localWeekMsg(s))}</p></div>
          <h4>Metas</h4>${goalsHTML || '<div class="hint">Sin metas.</div>'}
          <h4>Exámenes de la semana</h4>${examsHTML}
          <h4>Lo que viene</h4>${nextHTML}
        </div>
        <div class="modal-foot"><button class="btn" id="wrBiz">🌱 Tiempo para el negocio</button><span class="spacer"></span><button class="btn primary" data-close>¡Listo!</button></div>`,
      { wide: true, onClose: () => { App.state.settings.weeklyDone = ws; App.persist(); resolve(); } });
      m.root.querySelectorAll('[data-plan]').forEach((b) => (b.onclick = () => { const ev = App.getEv(b.dataset.plan); m.close(); App.openPlanModal(ev); }));
      $('#wrBiz', m.root).onclick = () => {
        const g = App.state.goals.find((x) => x.id === 'biz');
        if (!g) { App.toast('Crea una meta de negocio primero'); return; }
        m.close(); App.openPlanModal(null, { goal: g });
      };
      if (App.state.settings.geminiKey) {
        AI.freeText(App.state, `Es el repaso semanal. Datos de la semana ${s.ws} a ${s.we}: ${DU.fmtDur(s.studyMin)} de estudio, ${s.sessionsDone}/${s.sessions} sesiones completadas, ${s.defeated} exámenes bien preparados. Metas: ${s.goals.map(({ g, n }) => `${g.title} ${n} días`).join(', ')}. Escribe 3 frases: un reconocimiento concreto, algo a mejorar y un consejo para la próxima semana.`)
          .then((t) => { const p = $('#wrMsg', m.root); if (p && t) p.textContent = t; }).catch(() => {});
      }
      void force;
    });
  }

  // ---------- secuencia al abrir y revisión periódica ----------
  let ready = false;
  async function startup() {
    if (!App.state.settings.tourDone) await App.tour.start();
    if (shouldAskSleep()) await askSleep();
    if (shouldWeekly()) await openWeeklyReview();
    ready = true;
    if (shouldRead() && !busy()) openReading();
  }
  function tick() {
    if (!ready || busy()) return;
    if (shouldRead()) openReading();
  }

  App.rituals = { startup, tick, openReading, askSleep, openWeeklyReview, shouldAskSleep, shouldWeekly };
})();

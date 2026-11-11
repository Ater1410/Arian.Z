/* =========================================================
   focus.js — modo concentración: temporizador a pantalla completa
   con los temas a estudiar y la vida del jefe
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { DU } = window.Agenda;
  const FX = window.FX;
  const { $, $$, esc, el, icon } = App;

  const QUOTES = [
    'Un tema a la vez. Tú puedes 💪',
    'El celular lejos, la mente aquí 📵',
    'Cada minuto cuenta: le estás quitando vida al jefe ⚔️',
    'Si te trabas, escribe la duda y sigue con otra cosa ✍️',
    'Respira hondo. Vas muy bien 🌙',
  ];

  function topicsOf(ev) {
    return (ev.notes || '').split(/[,;\n]|\s+y\s+/).map((s) => s.trim()).filter((s) => s.length > 1).slice(0, 10);
  }

  function openFocus(target) {
    if ($('.focus-ov')) return;
    $('#toasts').innerHTML = '';
    const parent = target.parentId ? App.getEv(target.parentId) : (target.type === 'examen' || target.type === 'tarea' ? target : null);
    const subj = App.subjOf(target) || (parent && App.subjOf(parent));
    const planned = target.type === 'estudio' ? Math.max(10, Math.min(120, App.dur(target))) : 25;
    let total = planned * 60;
    let remaining = total;
    let running = false;
    let endAt = 0;
    let finished = false;
    let qi = 0;
    const topics = topicsOf(parent || target);
    const doneTopics = new Set((parent || target).topicsDone || []);
    const prevTitle = document.title;

    const ov = el(`<div class="focus-ov" style="--sc:${subj ? subj.color : 'var(--accent)'}">
      <button class="icon-btn focus-x" title="Salir">${icon('x', 20)}</button>
      <div class="focus-inner">
        <div class="focus-subj">${subj ? `${App.G() ? `<span>${subj.icon}</span> ` : ''}${esc(subj.name)}` : 'Concentración'}</div>
        <h2>${esc(target.title)}</h2>
        <div class="ring-wrap">
          <svg viewBox="0 0 220 220" class="ring"><circle cx="110" cy="110" r="96" class="track"/><circle cx="110" cy="110" r="96" class="prog" pathLength="100"/></svg>
          <div class="ring-text"><b id="fTime"></b><small id="fState">listo para empezar</small></div>
        </div>
        <div class="focus-len">${[25, 45, 60].map((n) => `<button data-len="${n}" class="${n === planned ? 'sel' : ''}">${n} min</button>`).join('')}${[25, 45, 60].includes(planned) ? '' : `<button data-len="${planned}" class="sel">${planned} min</button>`}</div>
        <div class="focus-ctrl">
          <button class="fbtn" id="fPlus" title="+5 minutos">+5</button>
          <button class="fbtn main" id="fPlay">${icon('play', 28)}</button>
          <button class="fbtn" id="fDone" title="Terminar">${icon('check', 22)}</button>
        </div>
        ${parent ? `<div class="focus-boss" id="fBoss"></div>` : ''}
        ${topics.length ? `<div class="focus-topics"><small>Temas</small>${topics.map((t) => `<button class="${doneTopics.has(t) ? 'on' : ''}" data-t="${esc(t)}">${doneTopics.has(t) ? '✓' : '○'} ${esc(t)}</button>`).join('')}</div>` : ''}
        <div class="focus-quote" id="fQuote">${QUOTES[0]}</div>
      </div></div>`);
    document.body.appendChild(ov);

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const paint = () => {
      if (running) remaining = Math.max(0, (endAt - Date.now()) / 1000);
      $('#fTime', ov).textContent = fmt(Math.ceil(remaining));
      $('.prog', ov).style.strokeDasharray = `${(remaining / total) * 100} 100`;
      $('#fPlay', ov).innerHTML = icon(running ? 'pause' : 'play', 28);
      $('#fState', ov).textContent = finished ? '¡sesión completa! 🎉' : running ? 'concentrado…' : remaining < total ? 'en pausa' : 'listo para empezar';
      document.title = running ? `⏱ ${fmt(Math.ceil(remaining))} · ${target.title}` : prevTitle;
      if (parent) {
        const b = App.bossOf(parent);
        const live = Math.max(0, b.hp - Math.floor((total - remaining) / 60));
        const pctLive = Math.round(live / b.maxHP * 100);
        $('#fBoss', ov).innerHTML = App.G()
          ? `<span class="bf">${b.face}</span><div><small>${esc(b.name)} · ❤️ ${DU.fmtDur(live)}</small><div class="hp"><i style="width:${pctLive}%"></i></div></div>`
          : `<div><small>${esc(parent.title)} · ${100 - pctLive}% preparado</small><div class="hp prep"><i style="width:${100 - pctLive}%"></i></div></div>`;
      }
      if (running && remaining <= 0) finish();
    };
    const finish = () => {
      running = false; finished = true; remaining = 0;
      FX.chime('end');
      if (App.state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('⏱ ¡Sesión completa!', { body: target.title }); } catch (_) { /* nada */ }
      }
    };
    const timer = setInterval(paint, 250);
    const quoteTimer = setInterval(() => { qi = (qi + 1) % QUOTES.length; $('#fQuote', ov).textContent = QUOTES[qi]; }, 45000);
    paint();

    $$('[data-len]', ov).forEach((b) => (b.onclick = () => {
      if (running || remaining < total) return;
      total = remaining = +b.dataset.len * 60;
      $$('[data-len]', ov).forEach((x) => x.classList.toggle('sel', x === b));
      paint();
    }));
    $('#fPlay', ov).onclick = () => {
      if (finished) return;
      if (running) { remaining = Math.max(0, (endAt - Date.now()) / 1000); running = false; }
      else { endAt = Date.now() + remaining * 1000; running = true; $('.focus-len', ov).classList.add('locked'); }
      paint();
    };
    $('#fPlus', ov).onclick = () => {
      if (running) endAt += 300000; else remaining += 300;
      total += 300; finished = false; paint();
    };
    $$('[data-t]', ov).forEach((b) => (b.onclick = () => {
      const t = b.dataset.t;
      if (doneTopics.has(t)) doneTopics.delete(t); else { doneTopics.add(t); FX.chime('ok'); }
      b.classList.toggle('on'); b.textContent = `${doneTopics.has(t) ? '✓' : '○'} ${t}`;
      (parent || target).topicsDone = [...doneTopics];
      App.persist();
    }));

    const close = () => {
      clearInterval(timer); clearInterval(quoteTimer);
      document.title = prevTitle;
      document.removeEventListener('keydown', onKey);
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 200);
    };
    const save = () => {
      if (running) remaining = Math.max(0, (endAt - Date.now()) / 1000);
      const mins = Math.round((total - remaining) / 60);
      if (mins < 1) return 0;
      if (target.type === 'estudio' && mins >= App.dur(target) * 0.8) App.markDone(target, true);
      else App.addFocus(target, mins);
      App.commit();
      return mins;
    };
    $('#fDone', ov).onclick = () => {
      const mins = save();
      close();
      if (mins) App.toast(parent ? (App.G() ? `⚔️ ${mins} min de estudio: le quitaste vida al ${App.bossOf(parent).name}` : `${mins} min de estudio · ${parent.title} al ${App.bossOf(parent).prep}%`) : `${mins} min de concentración`);
    };
    $('.focus-x', ov).onclick = async () => {
      const elapsed = Math.round((total - (running ? (endAt - Date.now()) / 1000 : remaining)) / 60);
      if (elapsed >= 1 && !finished) {
        if (!(await App.confirmBox(`¿Salir? Se guardarán los ${elapsed} min que llevas.`, 'Salir y guardar'))) return;
      }
      const mins = save();
      close();
      if (mins) App.toast(`Guardado: ${mins} min de estudio`);
    };
    const onKey = (e) => {
      if ($('#modalRoot').children.length) return;
      if (e.key === ' ') { e.preventDefault(); $('#fPlay', ov).click(); }
      if (e.key === 'Escape') $('.focus-x', ov).click();
    };
    document.addEventListener('keydown', onKey);
  }

  App.openFocus = openFocus;
})();

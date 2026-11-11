/* =========================================================
   tour.js — recorrido guiado de bienvenida (Luna explica la app)
   ========================================================= */
(function () {
  'use strict';
  const App = window.App;
  const { $, el, esc } = App;

  const STEPS = [
    { target: null, title: '¡Hola! Soy Luna 🌙', text: 'Te ayudo a organizar tus exámenes, tareas y metas. Te muestro la app en 30 segundos.' },
    { target: '.quickbar', view: 'today', title: 'Escribe o dicta aquí ✍️🎤', text: 'Por ejemplo: "examen de física el miércoles". Mientras escribes ves lo que entendí, y al guardar te pregunto qué tan importante y difícil es y cuánto tiempo te tomará.' },
    { target: '.hero', view: 'today', title: 'Tu día de un vistazo ☀️', text: 'El pronóstico te dice si es un día tranquilo o de tormenta. Abajo tienes lo que pasa ahora, lo siguiente con cuenta regresiva y tu día completo.' },
    { target: '#bossSection', view: 'today', title: 'Exámenes próximos', text: 'Aquí ves qué tan preparado estás para cada examen: cada sesión de estudio suma. Si quieres algo más divertido, activa el Modo juego en Ajustes y cada examen se vuelve un jefe 🐉 con barra de vida.' },
    { target: '.week-body', view: 'week', title: 'Tu semana 📅', text: 'Las zonas verdes son tus horas libres: haz clic o arrastra para crear algo. Arrastra las sesiones para moverlas y estíralas desde abajo para cambiar su duración. El colegio está comprimido para dar espacio a tus tardes.' },
    { target: '[data-view=goals]', title: 'Tu cielo de metas ✨', text: 'Leer enciende estrellas, dormir temprano hace crecer la luna y tu negocio es una plantita que crece con cada avance e idea.' },
    { target: '#lunaFab', title: 'Aquí estoy siempre 💬', text: 'Háblame cuando quieras. Para que entienda cualquier frase, conecta la IA gratis en Ajustes (⚙️). ¡Éxitos!' },
  ];

  function start() {
    return new Promise((resolve) => {
      if ($('.tour')) { resolve(); return; }
      let i = 0;
      const ov = el(`<div class="tour"><div class="tour-hole"></div><div class="tour-card">
        <div class="tour-luna"><span class="luna-face">🌙</span></div>
        <div class="tour-content"><b class="tour-title"></b><p class="tour-text"></p>
          <div class="tour-foot"><span class="tour-dots"></span><span class="spacer"></span>
            <button class="btn ghost sm" data-skip>Saltar</button>
            <button class="btn sm" data-back>Atrás</button>
            <button class="btn primary sm" data-next>Siguiente</button></div></div></div></div>`);
      document.body.appendChild(ov);
      const hole = $('.tour-hole', ov), card = $('.tour-card', ov);

      const show = () => {
        const s = STEPS[i];
        if (s.view && App.ui.view !== s.view) App.setView(s.view);
        $('.tour-title', ov).textContent = s.title;
        $('.tour-text', ov).textContent = s.text;
        $('.tour-dots', ov).innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
        $('[data-back]', ov).style.visibility = i ? 'visible' : 'hidden';
        $('[data-next]', ov).textContent = i === STEPS.length - 1 ? '¡Empezar!' : 'Siguiente';
        requestAnimationFrame(() => {
          const t = s.target && $(s.target);
          const r = t && t.getBoundingClientRect();
          if (!r || !r.width) {
            hole.style.cssText = `left:50%;top:45%;width:0;height:0`;
            card.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)';
            return;
          }
          const pad = 8;
          const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
          const h = Math.min(r.height + pad * 2, innerHeight - top - 4);
          hole.style.cssText = `left:${left}px;top:${top}px;width:${Math.min(r.width + pad * 2, innerWidth - left - 4)}px;height:${h}px`;
          const cw = Math.min(380, innerWidth - 24);
          const cardH = 190;
          let cy = top + h + 12;
          if (cy + cardH > innerHeight) cy = top - cardH - 12;
          if (cy < 8) cy = Math.max(8, Math.min(innerHeight - cardH - 8, top + 20));
          const cx = Math.max(12, Math.min(innerWidth - cw - 12, left + (r.width / 2) - cw / 2));
          card.style.cssText = `left:${cx}px;top:${cy}px;width:${cw}px`;
        });
      };
      const end = () => {
        ov.remove();
        window.removeEventListener('resize', show);
        App.state.settings.tourDone = true;
        App.persist();
        App.setView('today');
        resolve();
      };
      $('[data-next]', ov).onclick = () => { if (i === STEPS.length - 1) end(); else { i++; show(); } };
      $('[data-back]', ov).onclick = () => { if (i) { i--; show(); } };
      $('[data-skip]', ov).onclick = end;
      window.addEventListener('resize', show);
      show();
      void esc;
    });
  }

  App.tour = { start };
})();

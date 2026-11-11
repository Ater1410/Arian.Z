/* =========================================================
   fx.js — confeti, sonidos suaves y dictado por voz
   ========================================================= */
(function () {
  'use strict';

  // ---------- Confeti ----------
  function confetti({ count = 160, duration = 2600 } = {}) {
    if (!window.FX.fun) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = [css.getPropertyValue('--accent'), css.getPropertyValue('--accent-2'), '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#ffffff'].map((s) => s.trim() || '#888');
    const parts = [...Array(count)].map(() => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    const frame = (t) => {
      const k = (t - t0) / duration;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }

  // ---------- Sonidos ----------
  let actx = null;
  function chime(kind = 'ok') {
    if (!window.FX.fun && kind !== 'end') return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'win' ? [523, 659, 784, 1047] : kind === 'end' ? [784, 659, 523] : [660, 880];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t = actx.currentTime + i * 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + 0.4);
      });
    } catch (_) { /* sin sonido */ }
  }

  // ---------- Dictado por voz ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen({ onText, onEnd, onError }) {
    if (!SR) { onError && onError('Tu navegador no permite dictado. Usa Chrome o Edge.'); return null; }
    const rec = new SR();
    rec.lang = 'es-PE';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onText && onText((finalText + interim).trim(), false);
    };
    rec.onerror = (e) => onError && onError(e.error === 'not-allowed' ? 'Permite el micrófono para dictar.' : 'No te escuché bien, intenta otra vez.');
    rec.onend = () => { onText && finalText && onText(finalText.trim(), true); onEnd && onEnd(); };
    rec.start();
    return rec;
  }

  window.FX = { confetti, chime, listen, canListen: !!SR, fun: false };
})();

/* =========================================================
   ai.js — asistente: Google Gemini (gratis con API key) + modo básico sin IA
   ========================================================= */
(function () {
  'use strict';
  const { DU, norm, SUBJECTS, findSubject, classesOn } = window.Agenda;
  const P = window.Planner;

  const ASSISTANT_NAME = 'Luna';
  const TYPES = ['examen', 'tarea', 'evento', 'estudio', 'meta'];

  // ---------- Contexto que recibe la IA ----------
  function buildContext(state) {
    const today = DU.today();
    const lines = [];
    lines.push(`Hoy es ${DU.pretty(today)} (${today}), son las ${DU.toTime(DU.nowMin())}.`);
    lines.push('');
    lines.push('HORARIO DE CLASES (lunes a viernes, 07:45-15:40, salvo días sin clases):');
    for (let w = 1; w <= 5; w++) {
      lines.push(`- ${DU.DAYS[w]}: ` + classesOn(w).map((c) => `${c.start}-${c.end} ${c.name} [${c.subject}]`).join(', '));
    }
    lines.push('');
    lines.push('RUTINA FIJA:');
    state.routines.forEach((r) => lines.push(`- ${r.days.map((d) => DU.DAYS_SHORT[d]).join('/')}: ${r.start}-${r.end} ${r.title}`));
    lines.push(`- Entre semana puede estudiar hasta las ${state.settings.studyEnd}. Debe dormir antes de las ${state.settings.bedtime}.`);
    lines.push(`- Fin de semana disponible: ${state.settings.weekendWindows.map((w) => w.join('-')).join(' y ')}.`);
    if (state.settings.noSchoolDates.length) lines.push(`- Días sin clases: ${state.settings.noSchoolDates.join(', ')}`);
    if (state.settings.schoolEnd) lines.push(`- Último día de clases: ${state.settings.schoolEnd}`);
    lines.push('');
    lines.push('EVENTOS (id | tipo | fecha | hora | título | materia | importancia/dificultad/minutos | estado):');
    const from = DU.addDays(today, -3), to = DU.addDays(today, 45);
    const evs = state.events.filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    if (!evs.length) lines.push('(ninguno)');
    evs.slice(0, 80).forEach((e) => lines.push(
      `- ${e.id} | ${e.type} | ${e.date} | ${e.start || '-'}-${e.end || '-'} | ${e.title} | ${e.subject || '-'} | ${e.importance || '?'}/${e.difficulty || '?'}/${e.estMinutes || '?'} | ${e.done ? 'hecho' : 'pendiente'}${e.parentId ? ' | sesión de ' + e.parentId : ''}`));
    lines.push('');
    lines.push('METAS (id: título — hoy):');
    state.goals.forEach((g) => lines.push(`- ${g.id}: ${g.title} (${g.freq === 'daily' ? 'diaria' : g.target + ' veces/semana'}) — ${state.goalLog[g.id] && state.goalLog[g.id][today] ? 'cumplida hoy' : 'pendiente hoy'}`));
    lines.push('');
    lines.push('HUECOS LIBRES PRÓXIMOS 7 DÍAS:');
    for (let i = 0; i < 7; i++) {
      const d = DU.addDays(today, i);
      const s = P.freeSlots(state, d);
      lines.push(`- ${DU.DAYS_SHORT[DU.dow(d)]} ${d}: ${s.length ? s.map(([a, b]) => DU.toTime(a) + '-' + DU.toTime(b)).join(', ') : 'sin huecos'}`);
    }
    return lines.join('\n');
  }

  const SYSTEM = () => `Eres ${ASSISTANT_NAME}, la asistente de agenda de un estudiante de III SCB del Colegio Italiano Antonio Raimondi (Lima, Perú).
Hablas en español, en tono cercano, motivador y BREVE (máximo 3-4 frases). Tu trabajo es anotar exámenes, tareas y eventos en su calendario, ayudarle a organizarse y a cumplir sus metas (dormir temprano, leer, avanzar sus ideas de negocio; el estudio tiene prioridad sobre el negocio entre semana).

Respondes SIEMPRE con un único objeto JSON válido, sin texto fuera de él, con esta forma:
{
  "reply": "texto para el estudiante",
  "actions": [ ...cero o más acciones... ]
}

Acciones posibles:
- {"type":"create_event","kind":"examen|tarea|evento","title":"...","subject":"clave de materia o null","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","importance":1-5,"difficulty":1-5,"estMinutes":número,"notes":"..."}
- {"type":"update_event","id":"...","changes":{ campos a cambiar: title, date, start, end, importance, difficulty, estMinutes, notes, done }}
- {"type":"delete_event","id":"..."}
- {"type":"plan_study","id":"..."}   → propone sesiones de estudio para ese examen/tarea (el estudiante las aprueba)
- {"type":"check_goal","goalId":"...","date":"YYYY-MM-DD"}
- {"type":"plan_business"}            → propone bloques para la meta de negocio esta semana

Reglas:
- Claves de materia válidas: ${Object.keys(SUBJECTS).join(', ')}.
- Resuelve fechas relativas ("el jueves", "mañana", "la próxima semana") con la fecha de hoy. "El jueves" = el próximo jueves que viene.
- Para un examen, si esa materia tiene clase ese día, usa el horario de esa clase como start/end. Si no, usa 08:00-09:00.
- Para una tarea, start = hora de entrega (si no la dice: la hora de inicio de esa materia ese día; si no hay clase ese día, 07:45) y end = start + 30 min.
- Si el estudiante NO dice importancia, dificultad o tiempo, ESTÍMALOS tú (la app le pedirá confirmarlos). Examen típico: importancia 4, dificultad 3, 120-180 min de estudio.
- Nunca pongas cosas durante clases, fútbol, gimnasio ni después de la hora de dormir.
- Si te pide planificar/organizar estudio, usa plan_study (no crees sesiones de estudio sueltas con create_event).
- Para preguntas como "¿qué tengo esta semana?" responde en "reply" con un resumen ordenado y sin acciones.
- Si algo es ambiguo y no puedes deducirlo, pregunta en "reply" y no inventes acciones.
- No repitas acciones que ya se hicieron en mensajes anteriores.`;

  // ---------- Gemini ----------
  async function callGemini(state, contents, { json = true, system } = {}) {
    const key = state.settings.geminiKey.trim();
    const model = (state.settings.geminiModel || 'gemini-flash-latest').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      contents,
      generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('No hay conexión a internet (o Google no responde).');
    }
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error.message; } catch (_) { /* nada */ }
      if (res.status === 429) throw new Error('Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto y vuelve a intentar.');
      if (res.status === 400 && /api key/i.test(msg)) throw new Error('La API key de Gemini no es válida. Revísala en Ajustes.');
      if (res.status === 403) throw new Error('Google rechazó la API key (403). Revísala en Ajustes.');
      if (res.status === 404) throw new Error(`El modelo "${model}" no existe. Cámbialo en Ajustes (prueba gemini-flash-latest o gemini-2.5-flash).`);
      throw new Error(`Error de Gemini (${res.status}). ${msg}`);
    }
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  }

  function parseJSON(text) {
    let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (_) { /* sigue */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* sigue */ } }
    return { reply: text, actions: [] };
  }

  async function askGemini(state, userText) {
    // el último mensaje del chat es el actual del usuario: se envía aparte con el contexto
    const history = state.chat.slice(-13, -1).filter((m) => m.text && !m.error);
    while (history.length && history[0].role !== 'user') history.shift(); // Gemini debe empezar con el usuario
    const contents = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    contents.push({ role: 'user', parts: [{ text: `[CONTEXTO ACTUAL DE LA AGENDA]\n${buildContext(state)}\n\n[MENSAJE DEL ESTUDIANTE]\n${userText}` }] });
    const raw = await callGemini(state, contents, { json: true, system: SYSTEM() });
    const out = parseJSON(raw);
    return { reply: String(out.reply || ''), actions: Array.isArray(out.actions) ? out.actions.filter((a) => a && a.type) : [] };
  }

  async function dailySummaryAI(state) {
    const prompt = `${buildContext(state)}\n\nEscribe un resumen del día de HOY para el estudiante en 2-4 frases cortas: qué tiene hoy (clases importantes, entrenamientos), qué es lo más urgente de los próximos días (exámenes/tareas con mayor importancia y cercanía) y un consejo concreto para hoy (incluyendo su meta de dormir/leer). Sin saludos largos, sin markdown, puedes usar 1-2 emojis.`;
    return callGemini(state, [{ role: 'user', parts: [{ text: prompt }] }], { json: false, system: `Eres ${ASSISTANT_NAME}, asistente de agenda. Respondes en español, breve y motivador.` });
  }

  async function testConnection(state) {
    const t = await callGemini(state, [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }], { json: false });
    return t;
  }

  // ---------- Modo básico (sin IA): reglas simples en español ----------
  const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

  function parseDate(t) {
    const today = DU.today();
    if (/pasado manana/.test(t)) return DU.addDays(today, 2);
    if (/\bmanana\b/.test(t) && !/(en|por|de) la manana/.test(t.replace(/pasado manana/, ''))) return DU.addDays(today, 1);
    if (/\bhoy\b/.test(t)) return today;
    let m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : DU.parse(today).getFullYear();
      let d = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
      if (!m[3] && d < today) d = `${y + 1}${d.slice(4)}`;
      return d;
    }
    m = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
    if (m) {
      const y = DU.parse(today).getFullYear();
      let d = `${y}-${String(MONTHS[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
      if (d < today) d = `${y + 1}${d.slice(4)}`;
      return d;
    }
    for (const [name, w] of Object.entries(WEEKDAYS)) {
      if (new RegExp(`\\b${name}\\b`).test(t)) {
        let n = (w - DU.dow(today) + 7) % 7;
        if (n === 0) n = 7;
        if (/proxima semana|semana que viene/.test(t) && n < 7 && DU.addDays(today, n) < DU.addDays(DU.startOfWeek(today), 7)) n += 7;
        return DU.addDays(today, n);
      }
    }
    m = t.match(/\bel (\d{1,2})\b(?!\s*(:|h|hrs|horas|de la|am|pm))/);
    if (m) {
      const td = DU.parse(today);
      let d = new Date(td.getFullYear(), td.getMonth(), +m[1]);
      if (DU.fmt(d) < today) d = new Date(td.getFullYear(), td.getMonth() + 1, +m[1]);
      return DU.fmt(d);
    }
    if (/proxima semana|semana que viene/.test(t)) return DU.addDays(DU.startOfWeek(today), 7);
    return null;
  }

  function parseTime(t) {
    const m = t.match(/\ba las (\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|de la tarde|de la noche|de la manana)?/);
    if (!m) return null;
    let h = +m[1];
    const min = m[2] ? +m[2] : 0;
    if (m[3] && /pm|tarde|noche/.test(m[3]) && h < 12) h += 12;
    if (!m[3] && h >= 1 && h <= 6) h += 12; // "a las 4" → 16:00
    return DU.toTime(h * 60 + min);
  }

  function localParse(state, text) {
    const t = norm(text);
    const today = DU.today();

    // Preguntas de consulta
    if (/(que|cuales|cuantos?) .*(tengo|hay|pendiente)|mi semana|mi dia|que me toca/.test(t)) {
      let from = today, to = DU.addDays(today, 6), label = 'los próximos 7 días';
      if (/\bhoy\b/.test(t)) { to = today; label = 'hoy'; }
      else if (/manana/.test(t)) { from = to = DU.addDays(today, 1); label = 'mañana'; }
      const evs = state.events.filter((e) => e.date >= from && e.date <= to && !e.done)
        .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
      if (!evs.length) return { reply: `No tienes nada anotado para ${label}. ¡Buen momento para adelantar algo o avanzar tu negocio! 💡`, actions: [] };
      return { reply: `Para ${label} tienes:\n` + evs.map((e) => `• ${DU.prettyShort(e.date)} ${e.start || ''} — ${e.title}`).join('\n'), actions: [] };
    }

    if (/negocio/.test(t) && /(propon|tiempo|agenda|bloque|plan|organiza)/.test(t)) {
      return { reply: 'Te propongo estos bloques para tu negocio, sin quitarle tiempo al estudio:', actions: [{ type: 'plan_business' }] };
    }

    if (/(planifica|organiza|plan de estudio|cuando estudio|reparte)/.test(t) && !/(examen|prueba|tarea|practica)/.test(t)) {
      const next = state.events.filter((e) => (e.type === 'examen' || e.type === 'tarea') && !e.done && e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!next) return { reply: 'No tienes exámenes ni tareas pendientes para planificar. 🙌', actions: [] };
      return { reply: `Te propongo un plan para "${next.title}":`, actions: [{ type: 'plan_study', id: next.id }] };
    }

    const isExam = /(examen|prueba|practica calificada|test|evaluacion|control|oral)/.test(t);
    const isTask = /(tarea|deber|trabajo|entregar|entrega|proyecto|exposicion|informe|ensayo|lectura)/.test(t);
    if (!isExam && !isTask && !/(evento|cita|reunion|cumpleanos|partido|recordar|recuerdame|anota|agenda)/.test(t)) {
      return {
        reply: 'Estoy en modo básico (sin IA). Puedo entender cosas como:\n• "Examen de mate el jueves"\n• "Tarea de inglés para el 15/11"\n• "¿Qué tengo esta semana?"\n• "Planifica mi estudio"\n• "Propón tiempo para mi negocio"\nPara entender cualquier frase, conecta Gemini gratis en ⚙️ Ajustes.',
        actions: [],
      };
    }
    const kind = isExam ? 'examen' : isTask ? 'tarea' : 'evento';
    const subject = findSubject(text);
    const date = parseDate(t) || DU.addDays(today, 1);
    let start = parseTime(t), end = null;
    const cls = subject ? classesOn(DU.dow(date)).find((c) => c.subject === subject) : null;
    if (!start) {
      if (kind === 'examen') { start = cls ? cls.start : '08:00'; end = cls ? cls.end : '09:00'; }
      else if (kind === 'tarea') { start = cls ? cls.start : '07:45'; }
      else start = '17:00';
    }
    if (!end) end = DU.toTime(DU.toMin(start) + (kind === 'evento' ? 60 : 30));
    const subjName = subject ? SUBJECTS[subject].name : '';
    let topic = '';
    const tm = text.match(/\b(?:sobre|tema|temas|de los temas|capitulos?)\s+(.+)$/i);
    if (tm) topic = tm[1].trim();
    const base = kind === 'examen' ? 'Examen' : kind === 'tarea' ? 'Tarea' : 'Evento';
    let title = subjName ? `${base} de ${subjName}` : base;
    if (kind === 'evento') title = text.replace(/^(anota|agenda|recuerdame|recordar)\s*/i, '').slice(0, 60);
    const action = {
      type: 'create_event', kind, title, subject, date, start, end,
      // en modo básico no adivinamos: la app le pregunta al estudiante
      importance: null, difficulty: null, estMinutes: null,
      notes: topic || '',
    };
    return { reply: `Anoto: ${title}, ${DU.pretty(date)} a las ${start}. Confírmame cuán importante, difícil y cuánto tiempo te tomará 👇`, actions: [action] };
  }

  async function ask(state, text) {
    if (state.settings.geminiKey && state.settings.geminiKey.trim()) {
      const r = await askGemini(state, text);
      r.actions.forEach((a) => { if (a.type === 'create_event') a.estimated = true; });
      return r;
    }
    return localParse(state, text);
  }

  function localSummary(state) {
    const today = DU.today();
    const w = DU.dow(today);
    const parts = [];
    const school = P.isSchoolDay(state, today);
    const routines = P.routinesOn(state, today).filter((r) => !/camino|almuerzo/i.test(r.title));
    if (school) {
      const cls = classesOn(w);
      parts.push(`Hoy tienes ${cls.length} bloques de clase (${cls.map((c) => c.name).slice(0, 4).join(', ')}${cls.length > 4 ? '…' : ''})`);
    } else parts.push('Hoy no tienes clases');
    if (routines.length) parts[parts.length - 1] += ` y ${routines.map((r) => r.title.toLowerCase() + ' ' + r.icon).join(', ')}`;
    parts[parts.length - 1] += '.';
    const studyToday = state.events.filter((e) => e.date === today && e.type === 'estudio' && !e.done);
    if (studyToday.length) parts.push(`Estudio planificado: ${studyToday.map((e) => e.start + ' ' + e.title.replace(/^(Estudiar|Repaso|Avanzar): /, '')).join(', ')}.`);
    const urgent = state.events.filter((e) => (e.type === 'examen' || e.type === 'tarea') && !e.done && e.date >= today && DU.diffDays(today, e.date) <= 7)
      .sort((a, b) => urgency(b) - urgency(a));
    if (urgent.length) parts.push(`Lo más urgente: ${urgent[0].title} (${DU.relative(urgent[0].date)}).`);
    else parts.push('No hay exámenes ni tareas en los próximos 7 días. 🙌');
    parts.push(`Recuerda leer 10 min y dormir antes de las ${state.settings.bedtime} 🌙`);
    return parts.join(' ');
  }

  function urgency(e) {
    const days = Math.max(0, DU.diffDays(DU.today(), e.date));
    return (e.importance || 3) * 2 + (e.difficulty || 3) - days * 1.2;
  }

  window.AI = { ask, dailySummaryAI, localSummary, testConnection, buildContext, urgency, TYPES, ASSISTANT_NAME };
})();

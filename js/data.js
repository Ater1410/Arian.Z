/* =========================================================
   data.js — horario, valores por defecto, almacenamiento y utilidades de fecha
   ========================================================= */
(function () {
  'use strict';

  // ---------- Utilidades de fecha y hora ----------
  const pad = (n) => String(n).padStart(2, '0');
  const DU = {
    fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    today() { return DU.fmt(new Date()); },
    addDays(s, n) { const d = DU.parse(s); d.setDate(d.getDate() + n); return DU.fmt(d); },
    dow(s) { return DU.parse(s).getDay(); }, // 0 = domingo
    diffDays(a, b) { return Math.round((DU.parse(b) - DU.parse(a)) / 86400000); },
    startOfWeek(s) { const w = DU.dow(s); return DU.addDays(s, w === 0 ? -6 : 1 - w); }, // lunes
    toMin(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); },
    toTime(m) { m = Math.max(0, Math.min(24 * 60 - 1, Math.round(m))); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; },
    nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
    DAYS: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    DAYS_SHORT: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    MONTHS: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    pretty(s) { const d = DU.parse(s); return `${DU.DAYS[d.getDay()].toLowerCase()} ${d.getDate()} de ${DU.MONTHS[d.getMonth()]}`; },
    prettyShort(s) { const d = DU.parse(s); return `${DU.DAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; },
    relative(s) {
      const n = DU.diffDays(DU.today(), s);
      if (n === 0) return 'hoy';
      if (n === 1) return 'mañana';
      if (n === -1) return 'ayer';
      if (n < 0) return `hace ${-n} días`;
      return `en ${n} días`;
    },
    fmtDur(min) {
      min = Math.round(min);
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60), m = min % 60;
      return m ? `${h} h ${m} min` : `${h} h`;
    },
  };

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // ---------- Horario III SCB — Colegio Raimondi ----------
  const PERIODS = {
    0: ['07:45', '07:55'], 1: ['07:55', '08:40'], 2: ['08:40', '09:25'], 3: ['09:25', '10:10'],
    4: ['10:10', '10:55'], 5: ['11:10', '11:55'], 6: ['11:55', '12:40'], 7: ['12:40', '13:25'],
    8: ['14:10', '14:55'], 9: ['14:55', '15:40'],
  };
  const SCHOOL_START = '07:45';
  const SCHOOL_END = '15:40';
  const BREAKS = [['10:55', '11:10', 'Pausa'], ['13:25', '14:10', 'Pranzo']];

  const SUBJECTS = {
    storia: { icon: '🏛️', short: 'Storia', name: 'Storia', teacher: 'R. Valli', color: '#ff6b6b', aliases: ['storia', 'historia'] },
    comunicacion: { icon: '✍️', short: 'Comu', name: 'Comunicación', teacher: 'E. Vizcarra', color: '#2f4fb5', aliases: ['comunicacion', 'comu', 'lenguaje'] },
    italiano: { icon: '🇮🇹', short: 'Italiano', name: 'Italiano', teacher: 'S. Annunziata', color: '#16b8f3', aliases: ['italiano'] },
    filosofia: { icon: '🦉', short: 'Filo', name: 'Filosofia', teacher: 'V. Ursino', color: '#d9c66a', aliases: ['filosofia', 'filo'] },
    sociales: { icon: '🌎', short: 'Sociales', name: 'Ciencias Sociales', teacher: 'J. Santa Cruz', color: '#3a3ad6', aliases: ['ciencias sociales', 'sociales', 'ccss'] },
    tutoria: { icon: '🤝', short: 'Tutoría', name: 'Tutoría', teacher: 'F. Schwarz', color: '#14963c', aliases: ['tutoria'] },
    ingles: { icon: '🇬🇧', short: 'Inglés', name: 'Inglés', teacher: 'M. Mohatt', color: '#a020a0', aliases: ['ingles', 'english'] },
    scienze: { icon: '🧬', short: 'Scienze', name: 'Scienze', teacher: 'J. Lopez', color: '#6a6ad0', aliases: ['scienze', 'ciencias', 'biologia', 'quimica'] },
    edfisica: { icon: '🏃', short: 'Ed. Fís.', name: 'Ed. Física', teacher: 'J. Mori / N. Nieri', color: '#9093ff', aliases: ['educacion fisica', 'ed fisica', 'ed. fisica'] },
    latino: { icon: '📜', short: 'Latino', name: 'Latino', teacher: 'S. Annunziata', color: '#2bbdbd', aliases: ['latino', 'latin'] },
    matematica: { icon: '∫', short: 'Mate', name: 'Matemática', teacher: 'TG', color: '#e0c400', aliases: ['matematicas', 'matematica', 'mate', 'algebra', 'geometria', 'trigonometria'] },
    fisica: { icon: '⚛️', short: 'Física', name: 'Física', teacher: 'F. Schwarz', color: '#1fbf1f', aliases: ['fisica'] },
    arte: { icon: '🎨', short: 'Arte', name: "Diseg. e Storia dell'arte", teacher: 'C. Napoli', color: '#f5b028', aliases: ['historia del arte', 'disegno', 'dibujo', 'arte'] },
    religion: { icon: '✝️', short: 'Religión', name: 'Religión', teacher: 'J. Cabeza', color: '#f58f8f', aliases: ['religion'] },
    informatica: { icon: '💻', short: 'Info', name: 'Informática', teacher: 'A. Córdova', color: '#159a4a', aliases: ['informatica', 'computacion'] },
  };

  // [periodo inicial, periodo final, materia] por día (1 = lunes)
  const TIMETABLE = {
    1: [[1, 2, 'storia'], [3, 4, 'comunicacion'], [5, 6, 'italiano'], [7, 7, 'filosofia'], [8, 9, 'sociales']],
    2: [[1, 1, 'tutoria'], [2, 3, 'filosofia'], [4, 4, 'ingles'], [5, 5, 'ingles'], [6, 7, 'scienze'], [8, 9, 'italiano']],
    3: [[1, 2, 'italiano'], [3, 4, 'edfisica'], [5, 5, 'latino'], [6, 7, 'matematica'], [8, 9, 'fisica']],
    4: [[1, 2, 'scienze'], [3, 4, 'arte'], [5, 5, 'religion'], [6, 7, 'ingles'], [8, 9, 'matematica']],
    5: [[1, 2, 'latino'], [3, 4, 'matematica'], [5, 6, 'comunicacion'], [7, 7, 'fisica'], [8, 8, 'ingles'], [9, 9, 'informatica']],
  };

  function classesOn(dow) {
    return (TIMETABLE[dow] || []).map(([a, b, key]) => ({
      subject: key, start: PERIODS[a][0], end: PERIODS[b][1], ...SUBJECTS[key],
    }));
  }

  // Detecta una materia dentro de un texto libre
  const ALIAS_LIST = Object.entries(SUBJECTS)
    .flatMap(([k, s]) => s.aliases.map((a) => [a, k]))
    .sort((a, b) => b[0].length - a[0].length);
  function findSubject(text) {
    const t = ' ' + norm(text).replace(/[^a-z0-9. ]/g, ' ') + ' ';
    for (const [alias, key] of ALIAS_LIST) {
      if (t.includes(' ' + alias + ' ')) return key;
    }
    return null;
  }

  // ---------- Valores por defecto ----------
  const DEFAULT_ROUTINES = [
    { id: 'r1', title: 'Fútbol', icon: '⚽', days: [1, 3, 5], start: '15:40', end: '17:10' },
    { id: 'r2', title: 'Camino', icon: '🚗', days: [1, 3, 5], start: '17:10', end: '17:50' },
    { id: 'r3', title: 'Almuerzo', icon: '🍽️', days: [1, 3, 5], start: '17:50', end: '18:50' },
    { id: 'r4', title: 'Gimnasio', icon: '🏋️', days: [2, 4], start: '15:40', end: '18:00' },
    { id: 'r5', title: 'Camino', icon: '🚗', days: [2, 4], start: '18:00', end: '18:30' },
    { id: 'r6', title: 'Almuerzo', icon: '🍽️', days: [2, 4], start: '18:30', end: '19:30' },
  ];

  const DEFAULT_GOALS = [
    { id: 'sleep', title: 'Dormir antes de las 21:30', icon: '😴', freq: 'daily', target: 1 },
    { id: 'read', title: 'Leer 10 minutos', icon: '📖', freq: 'daily', target: 1 },
    { id: 'biz', title: 'Avanzar ideas de negocio', icon: '💡', freq: 'weekly', target: 2, optional: true,
      note: 'Si hay tiempo. En semana se prioriza el estudio.', ideas: [] },
  ];

  const DEFAULT_SETTINGS = {
    bedtime: '21:30',
    studyEnd: '21:00',          // hasta qué hora se puede estudiar entre semana
    freeDayStart: '16:30',      // si un día de clase no tiene rutina, desde cuándo
    weekendWindows: [['09:30', '13:00'], ['15:30', '20:30']],
    minSlot: 25,
    calStart: 7,
    calEnd: 22,
    theme: 'auto',
    geminiKey: '',
    geminiModel: 'gemini-flash-latest',
    noSchoolDates: [],
    schoolEnd: '',
    notifications: false,
    accent: 'violeta',        // violeta | raimondi | oceano | atardecer | rosa
    expandSchool: false,      // colegio comprimido en la vista semanal
    nightMode: true,          // modo noche automático + ritual de lectura
    gradeScale: 20,
    tourDone: false,
    sleepAsked: '',
    nightShown: '',
    weeklyDone: '',
  };

  // ---------- Almacenamiento ----------
  const KEY = 'agenda-raimondi-v1';
  function freshState() {
    return {
      version: 1,
      events: [],
      goals: JSON.parse(JSON.stringify(DEFAULT_GOALS)),
      goalLog: {},
      routines: JSON.parse(JSON.stringify(DEFAULT_ROUTINES)),
      settings: { ...DEFAULT_SETTINGS },
      chat: [],
      notified: {},
      summary: null,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return freshState();
      const s = JSON.parse(raw);
      const base = freshState();
      return {
        ...base, ...s,
        settings: { ...base.settings, ...(s.settings || {}) },
      };
    } catch (e) {
      console.warn('No se pudo leer el almacenamiento', e);
      return freshState();
    }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('No se pudo guardar', e); }
  }

  window.Agenda = {
    DU, norm, uid, PERIODS, BREAKS, SCHOOL_START, SCHOOL_END, SUBJECTS, TIMETABLE,
    classesOn, findSubject, DEFAULT_SETTINGS, DEFAULT_GOALS, DEFAULT_ROUTINES,
    freshState, load, save,
  };
})();

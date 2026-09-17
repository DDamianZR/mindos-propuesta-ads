// Datos de demostración: la semana de Jennifer.
//
// Estudia 6.º semestre de Ingeniería en Sistemas Computacionales y trabaja
// martes y jueves por la tarde. Sus profesores publican en plataformas
// distintas. Todas las fechas son relativas al lunes de la semana actual, así
// que la demo nunca muestra fechas vencidas ni días de la semana equivocados.

import { at, mondayOf, toISODate } from '../domain/time.js';
import { planSchedule } from '../domain/planner.js';

export const SCHEMA_VERSION = 4;

/** La demo empieza el lunes antes de la primera clase. */
export const DEMO_START = at(0, '06:50');

const profile = {
  name: 'Jennifer',
  fullName: 'Jennifer Méndez',
  program: 'Ingeniería en Sistemas Computacionales',
  semester: 6,
  job: 'Practicante de desarrollo',
  sleep: { bedtime: '23:00', wake: '06:30', windDownMinutes: 60, goalMinutes: 450 },
  studyStart: { weekday: '07:00', weekend: '09:00' },
  // Lunes a domingo. Los días que trabaja se permite menos estudio.
  focusLimits: [180, 120, 180, 120, 180, 240, 120],
  routines: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], start: '14:00', end: '15:00', label: 'Comida' }],
};

const courses = [
  { id: 'ads', name: 'Análisis y Diseño de Sistemas', short: 'ADS', teacher: 'Mtra. Laura Martínez', sourceId: 'classroom', tone: 1 },
  { id: 'bd', name: 'Bases de Datos', short: 'BD', teacher: 'Dr. Ricardo García', sourceId: 'teams', tone: 2 },
  { id: 'redes', name: 'Redes de Computadoras', short: 'Redes', teacher: 'Ing. Héctor Salinas', sourceId: 'classroom', tone: 3 },
  { id: 'pye', name: 'Probabilidad y Estadística', short: 'PyE', teacher: 'Dra. Elena Sánchez', sourceId: 'teams', tone: 4 },
];

const sources = [
  {
    id: 'classroom',
    name: 'Google Classroom',
    monogram: 'Cl',
    scopes: ['Tareas', 'Anuncios', 'Horario'],
    status: 'ok',
    lastSync: at(0, '06:45'),
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    monogram: 'Te',
    scopes: ['Tareas', 'Calendario'],
    status: 'ok',
    lastSync: at(-1, '22:10'),
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    monogram: 'Ca',
    scopes: ['Eventos personales'],
    status: 'ok',
    lastSync: at(0, '06:45'),
  },
  {
    id: 'asana',
    name: 'Asana',
    monogram: 'As',
    scopes: ['Tareas asignadas'],
    status: 'ok',
    lastSync: at(0, '06:45'),
  },
  {
    id: 'notion',
    name: 'Notion',
    monogram: 'No',
    scopes: ['Páginas compartidas'],
    status: 'error',
    error: 'El permiso de acceso venció.',
    lastSync: at(-2, '08:00'),
  },
  {
    id: 'drive',
    name: 'Google Drive',
    monogram: 'Dr',
    scopes: ['Archivos compartidos'],
    status: 'ok',
    lastSync: at(0, '06:45'),
    summary: '6 archivos vinculados a tus pendientes',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    monogram: 'Zo',
    scopes: ['Reuniones'],
    status: 'ok',
    lastSync: at(0, '06:45'),
  },
  {
    id: 'meet',
    name: 'Google Meet',
    monogram: 'Me',
    scopes: ['Reuniones'],
    status: 'ok',
    lastSync: at(0, '06:45'),
  },
];

const WEEKLY_CLASSES = [
  { weekday: 0, start: '07:00', end: '08:30', courseId: 'bd', location: 'Laboratorio de Bases de Datos' },
  { weekday: 0, start: '08:30', end: '10:00', courseId: 'ads', location: 'Salón 1107' },
  { weekday: 1, start: '07:00', end: '08:30', courseId: 'pye', location: 'Salón 2204' },
  { weekday: 1, start: '10:00', end: '11:30', courseId: 'redes', location: 'Laboratorio de Redes 2' },
  { weekday: 2, start: '07:00', end: '08:30', courseId: 'bd', location: 'Laboratorio de Bases de Datos' },
  { weekday: 2, start: '08:30', end: '10:00', courseId: 'ads', location: 'Salón 1107' },
  { weekday: 3, start: '07:00', end: '08:30', courseId: 'pye', location: 'Salón 2204' },
  { weekday: 3, start: '10:00', end: '11:30', courseId: 'redes', location: 'Laboratorio de Redes 2' },
  { weekday: 4, start: '08:30', end: '10:00', courseId: 'ads', location: 'Salón 1107' },
  { weekday: 4, start: '12:00', end: '13:30', courseId: 'pye', location: 'Salón 2204' },
];

const WORK_SHIFTS = [1, 3];

function buildEvents(weeks) {
  const events = [];
  for (let week = 0; week < weeks; week += 1) {
    for (const item of WEEKLY_CLASSES) {
      const day = week * 7 + item.weekday;
      const course = courses.find((entry) => entry.id === item.courseId);
      events.push({
        id: `class-${item.courseId}-${day}`,
        kind: 'class',
        title: course.name,
        courseId: course.id,
        sourceId: course.sourceId,
        start: at(day, item.start),
        end: at(day, item.end),
        location: item.location,
        people: [course.teacher],
      });
    }
    for (const weekday of WORK_SHIFTS) {
      const day = week * 7 + weekday;
      events.push({
        id: `work-${day}`,
        kind: 'work',
        title: 'Trabajo',
        sourceId: 'calendar',
        start: at(day, '15:00'),
        end: at(day, '19:00'),
        location: 'Oficina',
      });
    }
  }
  events.push(
    {
      id: 'meeting-equipo-ads',
      kind: 'meeting',
      title: 'Reunión del proyecto de ADS',
      courseId: 'ads',
      sourceId: 'zoom',
      start: at(2, '18:00'),
      end: at(2, '18:45'),
      location: 'Zoom',
      people: ['Ana', 'Carlos', 'Sofía'],
    },
    {
      id: 'meeting-asesoria-bd',
      kind: 'meeting',
      title: 'Asesoría de Bases de Datos',
      courseId: 'bd',
      sourceId: 'meet',
      start: at(4, '11:00'),
      end: at(4, '11:30'),
      location: 'Google Meet',
      people: ['el Dr. Ricardo García'],
    },
  );
  return events.sort((a, b) => a.start - b.start);
}

const QUIZ_ORIGINAL_DUE = at(8, '07:00');
const QUIZ_NEW_DUE = at(3, '07:00');

const tasks = [
  {
    id: 'asana-mockups',
    kind: 'review',
    title: 'Revisar mockups del equipo',
    short: 'Mockups del equipo',
    courseId: 'ads',
    sourceId: 'asana',
    due: at(2, '17:00'),
    effort: 60,
    progress: 0,
    done: false,
    assignedBy: 'Carlos',
    keywords: ['mockups', 'mockup', 'asana', 'equipo', 'disenos'],
  },
  {
    id: 'redes-vlsm',
    kind: 'assignment',
    title: 'Reporte de práctica 4: subnetting con VLSM',
    short: 'Reporte VLSM',
    courseId: 'redes',
    sourceId: 'classroom',
    due: at(2, '23:59'),
    effort: 120,
    progress: 0.25,
    done: false,
    keywords: ['vlsm', 'subnetting', 'practica 4', 'reporte', 'redes'],
  },
  {
    id: 'ads-casos-uso',
    kind: 'assignment',
    title: 'Entrega 2: diagramas de casos de uso',
    short: 'Casos de uso',
    courseId: 'ads',
    sourceId: 'classroom',
    due: at(3, '23:59'),
    effort: 180,
    progress: 1 / 3,
    done: false,
    keywords: ['casos de uso', 'diagramas', 'entrega 2', 'ads', 'analisis'],
  },
  {
    id: 'bd-normalizacion',
    kind: 'assignment',
    title: 'Práctica 3: normalización hasta 3FN',
    short: 'Práctica 3 de BD',
    courseId: 'bd',
    sourceId: 'teams',
    due: at(3, '23:59'),
    effort: 150,
    progress: 0.2,
    done: false,
    keywords: ['normalizacion', '3fn', 'practica 3', 'bases de datos'],
  },
  {
    id: 'pye-quiz2',
    kind: 'quiz',
    title: 'Quiz 2: distribuciones discretas',
    short: 'Quiz 2 de PyE',
    courseId: 'pye',
    sourceId: 'teams',
    due: QUIZ_ORIGINAL_DUE,
    effort: 120,
    progress: 0,
    done: false,
    keywords: ['quiz', 'distribuciones', 'probabilidad', 'estadistica', 'examen'],
  },
  {
    id: 'redes-cuestionario',
    kind: 'assignment',
    title: 'Cuestionario: capa de red',
    short: 'Cuestionario Redes',
    courseId: 'redes',
    sourceId: 'classroom',
    due: at(6, '23:59'),
    effort: 60,
    progress: 0,
    done: false,
    keywords: ['cuestionario', 'capa de red'],
  },
  {
    id: 'bd-proyecto-er',
    kind: 'project',
    title: 'Proyecto: modelo entidad-relación, avance 1',
    short: 'Modelo ER',
    courseId: 'bd',
    sourceId: 'notion',
    due: at(7, '23:59'),
    effort: 240,
    progress: 0.25,
    done: false,
    keywords: ['entidad relacion', 'modelo er', 'proyecto', 'avance'],
  },
  {
    id: 'pye-tarea3',
    kind: 'assignment',
    title: 'Tarea 3: probabilidad condicional',
    short: 'Tarea 3 de PyE',
    courseId: 'pye',
    sourceId: 'teams',
    due: at(-3, '23:59'),
    effort: 90,
    progress: 1,
    done: true,
    keywords: ['tarea 3', 'condicional'],
  },
  {
    id: 'ads-entrega1',
    kind: 'assignment',
    title: 'Entrega 1: planteamiento del problema',
    short: 'Entrega 1 de ADS',
    courseId: 'ads',
    sourceId: 'classroom',
    due: at(-4, '23:59'),
    effort: 120,
    progress: 1,
    done: true,
    keywords: ['entrega 1', 'planteamiento'],
  },
];

// Minutos dormidos las siete noches anteriores (de la más antigua a la más reciente).
const sleepLog = [412, 380, 455, 330, 395, 470, 360];

const activity = [
  {
    id: 'act-calendar-turnos',
    at: at(-6, '09:12'),
    sourceId: 'calendar',
    text: 'Se agregaron tus turnos de trabajo: martes y jueves de 15:00 a 19:00.',
  },
  {
    id: 'act-classroom-entrega2',
    at: at(-3, '18:40'),
    sourceId: 'classroom',
    text: 'La Mtra. Laura Martínez publicó «Entrega 2: diagramas de casos de uso».',
  },
  {
    id: 'act-notion-error',
    at: at(-2, '08:00'),
    sourceId: 'notion',
    tone: 'error',
    text: 'Notion dejó de sincronizar: el permiso de acceso venció.',
  },
  {
    id: 'act-teams-quiz',
    at: at(-2, '11:05'),
    sourceId: 'teams',
    text: 'La Dra. Elena Sánchez programó «Quiz 2: distribuciones discretas» para el martes de la próxima semana.',
  },
  {
    id: 'act-asana-mockups',
    at: at(-1, '20:30'),
    sourceId: 'asana',
    text: 'Carlos te asignó «Revisar mockups del equipo».',
  },
];

/**
 * Cambios que todavía no llegan a MindOS: aparecen al sincronizar.
 * Es el detonador de la historia de la demo.
 */
const remoteChanges = [
  {
    id: 'chg-quiz2-adelantado',
    sourceId: 'teams',
    taskId: 'pye-quiz2',
    field: 'due',
    from: QUIZ_ORIGINAL_DUE,
    to: QUIZ_NEW_DUE,
    actor: 'La Dra. Elena Sánchez',
  },
];

export function createDemoData(today = new Date()) {
  const data = {
    version: SCHEMA_VERSION,
    weekStart: toISODate(mondayOf(today)),
    now: DEMO_START,
    profile: structuredClone(profile),
    courses: structuredClone(courses),
    sources: structuredClone(sources),
    events: buildEvents(2),
    tasks: structuredClone(tasks),
    blocks: [],
    sleepLog: [...sleepLog],
    activity: structuredClone(activity),
    remoteChanges: structuredClone(remoteChanges),
  };
  return { ...data, blocks: planSchedule(data).blocks };
}

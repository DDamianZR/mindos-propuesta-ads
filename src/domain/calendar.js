// Disponibilidad real del estudiante: ventana de estudio, compromisos fijos
// (clases, reuniones, trabajo), rutinas y guardia de sueño.

import {
  MINUTES_PER_DAY,
  at,
  ceilTo,
  dayOf,
  isWeekend,
  parseClock,
  snapToSlots,
  subtract,
  weekdayOf,
} from './time.js';

/**
 * @typedef {'class' | 'meeting' | 'work'} EventKind
 *
 * @typedef {object} CalendarEvent
 * @property {string} id
 * @property {EventKind} kind
 * @property {string} title
 * @property {string} sourceId
 * @property {number} start          Minuto de semana.
 * @property {number} end
 * @property {string} [courseId]
 * @property {string} [location]
 * @property {string[]} [people]
 *
 * @typedef {object} Profile
 * @property {string} name
 * @property {{ bedtime: string, wake: string, windDownMinutes: number, goalMinutes: number }} sleep
 * @property {{ weekday: string, weekend: string }} studyStart
 * @property {number[]} focusLimits   Minutos de enfoque por día (lunes a domingo).
 * @property {{ weekdays: number[], start: string, end: string, label: string }[]} routines
 */

/** Margen alrededor de cada compromiso: traslados, cambiar de salón, descansar. */
export const EVENT_BUFFER = { class: 15, meeting: 15, work: 30 };

export function eventsOnDay(events, day) {
  const dayStart = day * MINUTES_PER_DAY;
  const dayEnd = dayStart + MINUTES_PER_DAY;
  return events
    .filter((event) => event.start < dayEnd && event.end > dayStart)
    .sort((a, b) => a.start - b.start);
}

/** Minutos de enfoque que el estudiante se permite ese día. */
export function focusLimit(profile, day) {
  return profile.focusLimits[weekdayOf(day)] ?? 0;
}

/** Ventana en la que MindOS puede agendar estudio. Termina antes de dormir. */
export function studyWindow(profile, day) {
  const start = at(day, isWeekend(day) ? profile.studyStart.weekend : profile.studyStart.weekday);
  const end = at(day, profile.sleep.bedtime) - profile.sleep.windDownMinutes;
  return [start, end];
}

/** Hora límite para estudiar, derivada de la hora de dormir. */
export function studyCutoff(profile) {
  return parseClock(profile.sleep.bedtime) - profile.sleep.windDownMinutes;
}

export function busyIntervals({ day, events, profile }) {
  const busy = eventsOnDay(events, day).map((event) => {
    const buffer = EVENT_BUFFER[event.kind] ?? 15;
    return [event.start - buffer, event.end + buffer];
  });
  for (const routine of profile.routines) {
    if (routine.weekdays.includes(weekdayOf(day))) {
      busy.push([at(day, routine.start), at(day, routine.end)]);
    }
  }
  return busy;
}

/**
 * Huecos libres de un día, alineados a la rejilla de planeación.
 * `reserved` son intervalos ya ocupados por otros bloques de estudio.
 * Si `now` cae en ese día, solo cuenta el tiempo futuro.
 */
export function freeIntervals({ day, events, profile, now = -Infinity, reserved = [] }) {
  const window = studyWindow(profile, day);
  const cuts = [...busyIntervals({ day, events, profile }), ...reserved];
  if (Number.isFinite(now) && dayOf(now) >= day) {
    cuts.push([window[0], ceilTo(now)]);
  }
  return snapToSlots(subtract([window], cuts));
}

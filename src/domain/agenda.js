// Agenda de un día: compromisos fijos, bloques de estudio y entregas.
// Es la misma para la app web y para el canal de WhatsApp.

import { eventsOnDay } from './calendar.js';
import { dayOf } from './time.js';

/**
 * @typedef {object} AgendaItem
 * @property {string} id
 * @property {'class' | 'meeting' | 'work' | 'study'} kind
 * @property {number} start
 * @property {number} end
 * @property {string} title
 * @property {import('./calendar.js').CalendarEvent} [event]
 * @property {import('./tasks.js').StudyBlock} [block]
 * @property {import('./tasks.js').Task} [task]
 */

export function agendaForDay(data, day) {
  const taskById = new Map(data.tasks.map((task) => [task.id, task]));
  const events = eventsOnDay(data.events, day).map((event) => ({
    id: event.id,
    kind: event.kind,
    start: event.start,
    end: event.end,
    title: event.title,
    event,
  }));
  const study = data.blocks
    .filter((block) => dayOf(block.start) === day && taskById.has(block.taskId))
    .map((block) => {
      const task = taskById.get(block.taskId);
      return { id: block.id, kind: 'study', start: block.start, end: block.end, title: task.title, block, task };
    });
  const items = [...events, ...study].sort((a, b) => a.start - b.start || a.end - b.end);
  const deadlines = data.tasks.filter((task) => !task.done && dayOf(task.due) === day).sort((a, b) => a.due - b.due);
  return { day, items, deadlines };
}

/** Lo que está pasando ahora y lo que sigue, a partir del reloj. */
export function currentAndNext(data) {
  const { items } = agendaForDay(data, dayOf(data.now));
  const pending = items.filter((item) => item.end > data.now && !item.block?.done);
  const current = pending.find((item) => item.start <= data.now) ?? null;
  const upcoming = pending.filter((item) => item.start > data.now);
  return { current, next: upcoming[0] ?? null, later: upcoming.slice(1) };
}

/** Primer compromiso o bloque de un día posterior, para cuando hoy ya no queda nada. */
export function firstItemAfterToday(data) {
  for (let day = dayOf(data.now) + 1; day <= dayOf(data.now) + 7; day += 1) {
    const { items } = agendaForDay(data, day);
    if (items.length > 0) return items[0];
  }
  return null;
}

// Frases del producto que deben decir lo mismo en la app y en WhatsApp.
// `emphasize` decide cómo se resalta un título en cada canal.

import { DAYS_PER_WEEK, MINUTES_PER_DAY, dayOf, minuteOfDay } from '../domain/time.js';
import { formatClock, formatHours, joinList, relativeDay, weekdayName } from './format.js';

const quoted = (text) => `«${text}»`;

const momentOf = (minute) => (minute < 12 * 60 ? 'por la mañana' : minute < 19 * 60 ? 'por la tarde' : 'por la noche');

/** "martes y jueves por la tarde": turnos de trabajo de la semana de la demo, agrupados por momento del día. */
export function workScheduleText(data) {
  const weekEnd = MINUTES_PER_DAY * DAYS_PER_WEEK;
  const shifts = data.events
    .filter((event) => event.kind === 'work' && event.start >= 0 && event.start < weekEnd)
    .sort((a, b) => a.start - b.start);
  if (shifts.length === 0) return null;
  const daysByMoment = new Map();
  for (const shift of shifts) {
    const moment = momentOf(minuteOfDay(shift.start));
    const days = daysByMoment.get(moment) ?? [];
    if (!days.includes(dayOf(shift.start))) days.push(dayOf(shift.start));
    daysByMoment.set(moment, days);
  }
  return joinList([...daysByMoment].map(([moment, days]) => `${joinList(days.map((day) => weekdayName(day)))} ${moment}`));
}

export function dueChangeText(change, task, { weekStart, now }, emphasize = quoted) {
  const moment = (minute) => `${relativeDay(weekStart, dayOf(minute), now)} a las ${formatClock(minute)}`;
  // "el jueves" → "al jueves"; "mañana" → "para mañana".
  const destination = (minute) => {
    const text = moment(minute);
    return text.startsWith('el ') ? `al ${text.slice(3)}` : `para ${text}`;
  };
  const verb = change.to < change.from ? 'adelantó' : 'movió';
  return `${change.actor} ${verb} ${emphasize(task.title)} ${destination(change.to)}. Antes era ${moment(change.from)}.`;
}

export function issueText(issue, data, emphasize = quoted) {
  const task = issue.taskId ? data.tasks.find((item) => item.id === issue.taskId) : null;
  switch (issue.type) {
    case 'late-blocks':
      return `Tu estudio para ${emphasize(task.title)} quedó después de la fecha límite.`;
    case 'overload':
      return `El ${weekdayName(issue.day)} tendrías ${formatHours(issue.demand)} de trabajo para ${formatHours(issue.capacity)} de enfoque.`;
    case 'overdue':
      return `${emphasize(task.title)} ya venció.`;
    default:
      return '';
  }
}

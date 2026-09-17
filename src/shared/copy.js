// Frases del producto que deben decir lo mismo en la app y en WhatsApp.
// `emphasize` decide cómo se resalta un título en cada canal.

import { dayOf } from '../domain/time.js';
import { formatClock, formatHours, relativeDay, weekdayName } from './format.js';

const quoted = (text) => `«${text}»`;

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

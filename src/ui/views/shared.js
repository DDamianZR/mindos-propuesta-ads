// Piezas que comparten varias vistas.

import { dayOf } from '../../domain/time.js';
import { formatClock, formatDuration, relativeDay } from '../../shared/format.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

export const ITEM_KINDS = {
  class: { icon: 'book', label: 'Clase' },
  meeting: { icon: 'video', label: 'Reunión' },
  work: { icon: 'briefcase', label: 'Trabajo' },
  study: { icon: 'focus', label: 'Bloque de estudio' },
};

export function viewHeader({ title, lede }) {
  return h(
    'header',
    { class: 'view-header' },
    h('h1', { class: 'view-title', tabindex: '-1' }, title),
    lede && h('p', { class: 'view-lede' }, lede),
  );
}

/** Cómo va el plan de una tarea: planeada, con estudio tarde o sin espacio. */
export function planStatus(task, data, analysis) {
  if (task.done) return null;
  const late = analysis.issues.some((issue) => issue.type === 'late-blocks' && issue.taskId === task.id);
  if (late) {
    return h('span', { class: 'plan-status is-tight' }, icon('alert', { size: 14 }), 'Estudio después de la fecha');
  }
  const missing = analysis.unplannedByTask.get(task.id);
  if (missing) {
    return h('span', { class: 'plan-status is-over' }, icon('alert', { size: 14 }), `${formatDuration(missing)} sin espacio`);
  }
  const next = data.blocks
    .filter((block) => block.taskId === task.id && !block.done && block.end > data.now)
    .sort((a, b) => a.start - b.start)[0];
  if (!next) return null;
  return h(
    'span',
    { class: 'plan-status is-planned' },
    icon('focus', { size: 14 }),
    `Planeada ${relativeDay(data.weekStart, dayOf(next.start), data.now)}, ${formatClock(next.start)}`,
  );
}

// Pendientes académicos normalizados, vengan de la plataforma que vengan.

import { ceilTo, dayOf, minuteOfDay, parseClock } from './time.js';

/**
 * @typedef {'assignment' | 'quiz' | 'project' | 'review'} TaskKind
 *
 * @typedef {object} Task
 * @property {string} id
 * @property {TaskKind} kind
 * @property {string} title
 * @property {string} courseId
 * @property {string} sourceId
 * @property {number} due            Minuto de semana de la fecha límite.
 * @property {number} effort         Minutos estimados en total.
 * @property {number} progress       Avance previo (0 a 1).
 * @property {boolean} done
 * @property {string[]} [keywords]   Palabras con las que el estudiante la menciona.
 *
 * @typedef {object} StudyBlock
 * @property {string} id
 * @property {string} taskId
 * @property {number} start
 * @property {number} end
 * @property {boolean} done
 */

/** El trabajo debe terminar al menos una hora antes de la fecha límite. */
export const DUE_MARGIN = 60;

/** Si la entrega vence antes de este horario, el último día útil es el anterior. */
const EARLY_DUE_CUTOFF = parseClock('12:00');

export function blockMinutes(block) {
  return block.end - block.start;
}

/** Minutos de trabajo que faltan, descontando los bloques ya completados. */
export function effortLeft(task, blocks = []) {
  if (task.done) return 0;
  // Math.round evita que 180 × (1 − 1/3) = 120.00000000000001 se redondee a 150.
  const pending = ceilTo(Math.round(task.effort * (1 - task.progress)));
  const completed = blocks
    .filter((block) => block.taskId === task.id && block.done)
    .reduce((sum, block) => sum + blockMinutes(block), 0);
  return Math.max(0, pending - completed);
}

/** Momento a partir del cual un bloque ya no ayuda con la entrega. */
export function workDeadline(task) {
  return task.due - DUE_MARGIN;
}

export function lastWorkDay(task) {
  const day = dayOf(task.due);
  return minuteOfDay(task.due) < EARLY_DUE_CUTOFF ? day - 1 : day;
}

export function byDeadline(a, b) {
  return a.due - b.due || b.effort - a.effort || a.id.localeCompare(b.id);
}

/**
 * Agrupa por urgencia con el vocabulario que usa el estudiante.
 * @returns {'overdue' | 'today' | 'tomorrow' | 'week' | 'later'}
 */
export function urgencyOf(task, now) {
  if (task.due <= now) return 'overdue';
  const days = dayOf(task.due) - dayOf(now);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (dayOf(task.due) <= 6) return 'week';
  return 'later';
}

export function pendingTasks(tasks) {
  return tasks.filter((task) => !task.done).sort(byDeadline);
}

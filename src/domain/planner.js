// Planificador de bloques de estudio.
//
// Reglas, en orden de prioridad:
// 1. Nunca agenda fuera de la ventana de estudio (la hora de dormir es intocable).
// 2. Nunca agenda encima de clases, reuniones, trabajo o comidas.
// 3. Atiende primero lo que vence antes (earliest deadline first).
// 4. Conserva los bloques que siguen siendo válidos: cambiar el plan tiene un costo.
// 5. Reparte la carga entre días según el límite de enfoque de cada uno.
// 6. Solo si no hay otra salida, excede el límite de enfoque con un tope diario.

import { SLOT, contains, dayOf, floorTo, length, snapToSlots, subtract } from './time.js';
import { focusLimit, freeIntervals } from './calendar.js';
import { blockMinutes, byDeadline, effortLeft, workDeadline } from './tasks.js';
import { analyzeWeek } from './workload.js';

export const MAX_BLOCK = 120;
export const MIN_BLOCK = 60;
export const BREAK_BETWEEN_BLOCKS = 30;
export const MAX_EXTENSION = 60;

const byStart = (a, b) => a.start - b.start || a.taskId.localeCompare(b.taskId);

const padded = (block) => [block.start - BREAK_BETWEEN_BLOCKS, block.end + BREAK_BETWEEN_BLOCKS];

export function blockId(taskId, start) {
  return `blk-${taskId}-${start}`;
}

/**
 * Calcula el plan de bloques futuros.
 * @returns {{ blocks: import('./tasks.js').StudyBlock[], unplaced: { taskId: string, minutes: number }[] }}
 */
export function planSchedule({ tasks, events, profile, now, blocks = [] }) {
  const completed = blocks.filter((block) => block.done);
  const inProgress = blocks.filter((block) => !block.done && block.start < now && block.end > now);
  const previous = blocks.filter((block) => !block.done && block.start >= now);

  const reserved = inProgress.map(padded);
  const usedByDay = new Map();
  const addUsage = (day, minutes) => usedByDay.set(day, (usedByDay.get(day) ?? 0) + minutes);
  for (const block of [...completed, ...inProgress]) addUsage(dayOf(block.start), blockMinutes(block));

  const queue = tasks.filter((task) => !task.done && workDeadline(task) > now).sort(byDeadline);
  const waiting = new Set(queue.map((task) => task.id));
  const planned = [];
  const unplaced = [];

  const commit = (block) => {
    planned.push(block);
    reserved.push(padded(block));
    addUsage(dayOf(block.start), blockMinutes(block));
  };

  const findSlot = (day, wanted, minimum, deadline, soft) => {
    const bounded = snapToSlots(
      freeIntervals({ day, events, profile, now, reserved }).map(([start, end]) => [start, Math.min(end, deadline)]),
    );
    const preferred = snapToSlots(subtract(bounded, soft));
    for (const intervals of [preferred, bounded]) {
      const exact = intervals.find((interval) => length(interval) >= wanted);
      if (exact) return [exact[0], exact[0] + wanted];
    }
    for (const intervals of [preferred, bounded]) {
      const largest = intervals.reduce((best, interval) => (!best || length(interval) > length(best) ? interval : best), null);
      if (largest && length(largest) >= minimum) return largest;
    }
    return null;
  };

  /**
   * `softBlocks` son bloques previos de tareas que aún no se procesan: se evita
   * ocupar sus huecos y cuentan como carga del día, porque probablemente se conserven.
   */
  const place = (task, need, extension, softBlocks) => {
    const deadline = workDeadline(task);
    const soft = softBlocks.map(padded);
    const softMinutes = (day) =>
      softBlocks.filter((block) => dayOf(block.start) === day).reduce((sum, block) => sum + blockMinutes(block), 0);
    let remaining = need;
    while (remaining >= SLOT) {
      const target = floorTo(Math.min(remaining, MAX_BLOCK));
      let best = null;
      // Primero busca bloques de al menos una hora; los de 30 minutos son el último recurso.
      for (const minimum of [Math.min(MIN_BLOCK, target), SLOT]) {
        for (let day = dayOf(now); day <= dayOf(deadline - 1); day += 1) {
          const limit = focusLimit(profile, day);
          if (limit === 0) continue;
          const used = usedByDay.get(day) ?? 0;
          const wanted = floorTo(Math.min(target, limit + extension - used));
          if (wanted < minimum) continue;
          const slot = findSlot(day, wanted, minimum, deadline, soft);
          if (!slot) continue;
          const expected = used + softMinutes(day);
          const candidate = {
            day,
            slot,
            complete: length(slot) === target,
            pressure: extension > 0 ? Math.max(0, used - limit) : expected / limit,
          };
          const better =
            !best ||
            (candidate.complete !== best.complete
              ? candidate.complete
              : candidate.pressure !== best.pressure
                ? candidate.pressure < best.pressure
                : candidate.day < best.day);
          if (better) best = candidate;
        }
        if (best) break;
      }
      if (!best) break;
      commit({ id: blockId(task.id, best.slot[0]), taskId: task.id, start: best.slot[0], end: best.slot[1], done: false });
      remaining -= length(best.slot);
    }
    return remaining;
  };

  for (const task of queue) {
    waiting.delete(task.id);
    const running = inProgress
      .filter((block) => block.taskId === task.id)
      .reduce((sum, block) => sum + blockMinutes(block), 0);
    let need = effortLeft(task, completed) - running;
    if (need < SLOT) continue;
    const deadline = workDeadline(task);

    for (const block of previous.filter((item) => item.taskId === task.id).sort(byStart)) {
      if (need < SLOT) break;
      const minutes = Math.min(blockMinutes(block), floorTo(need));
      const kept = { ...block, end: block.start + minutes };
      const day = dayOf(kept.start);
      if (kept.end > deadline) continue;
      if ((usedByDay.get(day) ?? 0) + minutes > focusLimit(profile, day)) continue;
      const free = freeIntervals({ day, events, profile, now, reserved });
      if (!free.some((interval) => contains(interval, [kept.start, kept.end]))) continue;
      commit(kept);
      need -= minutes;
    }

    const softBlocks = previous.filter((block) => waiting.has(block.taskId));
    need = place(task, need, 0, softBlocks);
    if (need >= SLOT) need = place(task, need, MAX_EXTENSION, softBlocks);
    if (need > 0) unplaced.push({ taskId: task.id, minutes: need });
  }

  return { blocks: planned.sort(byStart), unplaced };
}

/** Traduce la diferencia entre dos planes a cambios que una persona entiende. */
export function diffPlans(before, after) {
  const key = (block) => `${block.taskId}@${block.start}-${block.end}`;
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  const removed = before.filter((block) => !afterKeys.has(key(block))).sort(byStart);
  const added = after.filter((block) => !beforeKeys.has(key(block))).sort(byStart);

  const changes = [];
  const taskIds = [...new Set([...removed, ...added].map((block) => block.taskId))];
  for (const taskId of taskIds) {
    const from = removed.filter((block) => block.taskId === taskId);
    const to = added.filter((block) => block.taskId === taskId);
    const pairs = Math.min(from.length, to.length);
    for (let index = 0; index < pairs; index += 1) {
      changes.push({ type: 'move', taskId, from: [from[index].start, from[index].end], to: [to[index].start, to[index].end] });
    }
    for (const block of from.slice(pairs)) changes.push({ type: 'remove', taskId, from: [block.start, block.end] });
    for (const block of to.slice(pairs)) changes.push({ type: 'add', taskId, to: [block.start, block.end] });
  }
  const anchor = (change) => (change.to ?? change.from)[0];
  return changes.sort((a, b) => anchor(a) - anchor(b));
}

/**
 * Propuesta de reorganización: el plan nuevo, los cambios y su impacto.
 * No modifica el estado; el estudiante decide si la aplica.
 */
export function createProposal(state) {
  const { blocks, now } = state;
  const current = blocks.filter((block) => !block.done && block.start >= now);
  const fixed = blocks.filter((block) => block.done || block.start < now);
  const { blocks: planned, unplaced } = planSchedule(state);
  const nextBlocks = [...fixed, ...planned].sort(byStart);

  const before = analyzeWeek(state);
  const after = analyzeWeek({ ...state, blocks: nextBlocks });
  const impact = after.days
    .map((day) => ({
      day: day.day,
      before: before.days[day.day].demand,
      after: day.demand,
      levelBefore: before.days[day.day].level,
      levelAfter: day.level,
      extended: day.extended,
    }))
    .filter((entry) => !before.days[entry.day].past && (entry.before !== entry.after || entry.levelBefore !== entry.levelAfter));

  return {
    blocks: nextBlocks,
    changes: diffPlans(current, planned),
    unplaced,
    impact,
    issuesBefore: before.issues.length,
    issuesAfter: after.issues.length,
    extendedDays: after.days.filter((day) => day.extended && !day.past).map((day) => day.day),
  };
}

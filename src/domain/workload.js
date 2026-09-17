// Radar de carga: compara, día por día, el trabajo que viene con el tiempo
// real de enfoque disponible, y detecta lo que ninguna plataforma ve por
// separado (bloques que quedaron después de una fecha límite, días saturados).

import { DAYS_PER_WEEK, dayOf, totalLength } from './time.js';
import { focusLimit, freeIntervals } from './calendar.js';
import { blockMinutes, effortLeft, lastWorkDay } from './tasks.js';

/** A partir de este porcentaje de la capacidad, el día se considera justo. */
export const TIGHT_RATIO = 0.85;

/** @typedef {'free' | 'ok' | 'tight' | 'over'} LoadLevel */

export function levelOf({ demand, capacity, free, unplanned }) {
  if (demand === 0) return 'free';
  if (demand > free) return 'over';
  if (demand > capacity) return unplanned > 0 ? 'over' : 'tight';
  if (demand > capacity * TIGHT_RATIO) return 'tight';
  return 'ok';
}

function minutesOn(blocks, day) {
  return blocks
    .filter((block) => dayOf(block.start) === day)
    .reduce((sum, block) => sum + blockMinutes(block), 0);
}

export function analyzeWeek({ tasks, blocks, events, profile, now }) {
  const today = dayOf(now);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const completed = blocks.filter((block) => block.done);
  const active = blocks.filter((block) => {
    const task = taskById.get(block.taskId);
    return !block.done && block.end > now && task && !task.done;
  });
  const onTime = active.filter((block) => block.end <= taskById.get(block.taskId).due);
  const late = active.filter((block) => block.end > taskById.get(block.taskId).due);

  // Lo que falta y no cubre ningún bloque válido se acumula en el último día útil.
  const unplannedByTask = new Map();
  const unplannedByDay = new Map();
  for (const task of tasks) {
    if (task.done || task.due <= now) continue;
    const covered = onTime
      .filter((block) => block.taskId === task.id)
      .reduce((sum, block) => sum + blockMinutes(block), 0);
    const missing = effortLeft(task, completed) - covered;
    if (missing <= 0) continue;
    unplannedByTask.set(task.id, missing);
    const day = Math.max(today, lastWorkDay(task));
    unplannedByDay.set(day, (unplannedByDay.get(day) ?? 0) + missing);
  }

  const days = [];
  for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
    const limit = focusLimit(profile, day);
    const free = totalLength(freeIntervals({ day, events, profile }));
    const capacity = Math.min(limit, free);
    const done = minutesOn(completed, day);
    const planned = minutesOn(onTime, day);
    const unplanned = unplannedByDay.get(day) ?? 0;
    const demand = done + planned + unplanned;
    days.push({
      day,
      limit,
      free,
      capacity,
      done,
      planned,
      unplanned,
      demand,
      past: day < today,
      extended: done + planned > limit,
      level: levelOf({ demand, capacity, free, unplanned }),
      deadlines: tasks
        .filter((task) => !task.done && dayOf(task.due) === day)
        .sort((a, b) => a.due - b.due)
        .map((task) => task.id),
    });
  }

  const issues = [];
  const lateByTask = new Map();
  for (const block of late) {
    lateByTask.set(block.taskId, [...(lateByTask.get(block.taskId) ?? []), block]);
  }
  for (const [taskId, lateBlocks] of lateByTask) {
    issues.push({
      type: 'late-blocks',
      taskId,
      blockIds: lateBlocks.map((block) => block.id),
      minutes: lateBlocks.reduce((sum, block) => sum + blockMinutes(block), 0),
    });
  }
  for (const entry of days) {
    if (entry.level === 'over' && !entry.past) {
      issues.push({ type: 'overload', day: entry.day, demand: entry.demand, capacity: entry.capacity });
    }
  }
  for (const task of tasks) {
    if (!task.done && task.due <= now) issues.push({ type: 'overdue', taskId: task.id });
  }

  const upcoming = days.filter((entry) => !entry.past);
  return {
    today,
    days,
    issues,
    unplannedByTask,
    totals: {
      demand: upcoming.reduce((sum, entry) => sum + entry.demand, 0),
      capacity: upcoming.reduce((sum, entry) => sum + entry.capacity, 0),
    },
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDemoData } from '../src/data/seed.js';
import { busyIntervals, focusLimit, studyWindow } from '../src/domain/calendar.js';
import { MAX_EXTENSION, createProposal, diffPlans, planSchedule } from '../src/domain/planner.js';
import { DUE_MARGIN, effortLeft } from '../src/domain/tasks.js';
import { at, contains, dayOf, mondayOf, overlaps, snapToSlots, subtract, toISODate } from '../src/domain/time.js';

const demo = () => createDemoData(new Date(2026, 8, 16));

const withTask = (state, taskId, patch) => ({
  ...state,
  tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
});

function assertValidPlan(state, blocks) {
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));
  for (const block of blocks) {
    const day = dayOf(block.start);
    const task = taskById.get(block.taskId);
    assert.ok(contains(studyWindow(state.profile, day), [block.start, block.end]), `${block.id} fuera de la ventana de estudio`);
    for (const busy of busyIntervals({ day, events: state.events, profile: state.profile })) {
      assert.ok(!overlaps(busy, [block.start, block.end]), `${block.id} se encima con un compromiso`);
    }
    assert.ok(block.end <= task.due - DUE_MARGIN, `${block.id} termina muy cerca de la fecha límite`);
    assert.ok(block.start >= state.now, `${block.id} quedó en el pasado`);
  }
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(sorted[index].start >= sorted[index - 1].end, 'dos bloques se enciman');
  }
}

test('las utilidades de intervalos restan y alinean a la rejilla', () => {
  assert.deepEqual(subtract([[0, 100]], [[20, 30], [50, 60]]), [[0, 20], [30, 50], [60, 100]]);
  assert.deepEqual(snapToSlots([[425, 530], [600, 620]]), [[450, 510]]);
  assert.equal(toISODate(mondayOf(new Date(2026, 8, 20))), '2026-09-14');
  assert.equal(toISODate(mondayOf(new Date(2026, 8, 14))), '2026-09-14');
});

test('el plan inicial respeta clases, trabajo, sueño y fechas límite', () => {
  const state = demo();
  assert.ok(state.blocks.length > 0);
  assertValidPlan(state, state.blocks);
});

test('el plan inicial cubre todo el trabajo sin exceder los límites de enfoque', () => {
  const state = demo();
  const { unplaced } = planSchedule(state);
  assert.deepEqual(unplaced, []);
  for (const task of state.tasks.filter((item) => !item.done)) {
    const planned = state.blocks.filter((block) => block.taskId === task.id).reduce((sum, block) => sum + block.end - block.start, 0);
    assert.equal(planned, effortLeft(task), `${task.id} no quedó cubierta`);
  }
  for (let day = 0; day < 7; day += 1) {
    const used = state.blocks.filter((block) => dayOf(block.start) === day).reduce((sum, block) => sum + block.end - block.start, 0);
    assert.ok(used <= focusLimit(state.profile, day), `el día ${day} excede el límite`);
  }
});

test('replanificar un plan válido no propone cambios', () => {
  const proposal = createProposal(demo());
  assert.deepEqual(proposal.changes, []);
});

test('cuando se adelanta una fecha, la propuesta mueve lo mínimo y resuelve los problemas', () => {
  const state = withTask(demo(), 'pye-quiz2', { due: at(3, '07:00') });
  const proposal = createProposal(state);
  assert.ok(proposal.issuesBefore > 0);
  assert.equal(proposal.issuesAfter, 0);
  assert.deepEqual(proposal.unplaced, []);
  assert.ok(proposal.changes.length <= 2, 'la propuesta no debería reacomodar toda la semana');
  assert.ok(proposal.changes.every((change) => change.taskId === 'pye-quiz2' || change.type === 'move'));
  assertValidPlan(state, proposal.blocks.filter((block) => !block.done));
});

test('prioriza la fecha límite más cercana cuando no alcanza el tiempo', () => {
  const base = demo();
  const state = {
    ...base,
    tasks: [
      { id: 'tarde', kind: 'assignment', title: 'Tarde', courseId: 'ads', sourceId: 'classroom', due: at(1, '23:59'), effort: 600, progress: 0, done: false },
      { id: 'pronto', kind: 'assignment', title: 'Pronto', courseId: 'bd', sourceId: 'teams', due: at(1, '12:00'), effort: 120, progress: 0, done: false },
    ],
    blocks: [],
  };
  const { blocks, unplaced } = planSchedule(state);
  const planned = (taskId) => blocks.filter((block) => block.taskId === taskId).reduce((sum, block) => sum + block.end - block.start, 0);
  assert.equal(planned('pronto'), 120);
  assert.ok(unplaced.some((entry) => entry.taskId === 'tarde'));
  assert.ok(!unplaced.some((entry) => entry.taskId === 'pronto'));
});

test('solo excede el límite de enfoque cuando es inevitable y con tope diario', () => {
  const base = demo();
  const state = {
    ...base,
    tasks: [
      { id: 'urgente', kind: 'assignment', title: 'Urgente', courseId: 'ads', sourceId: 'classroom', due: at(0, '23:59'), effort: 210, progress: 0, done: false },
    ],
    blocks: [],
  };
  const { blocks, unplaced } = planSchedule(state);
  const used = blocks.reduce((sum, block) => sum + block.end - block.start, 0);
  assert.equal(used, 210);
  assert.deepEqual(unplaced, []);
  assert.ok(used <= focusLimit(base.profile, 0) + MAX_EXTENSION);
});

test('las tareas terminadas liberan sus bloques', () => {
  const state = withTask(demo(), 'redes-vlsm', { done: true });
  const { blocks } = planSchedule(state);
  assert.ok(!blocks.some((block) => block.taskId === 'redes-vlsm'));
});

test('no agenda en el pasado cuando avanza el reloj', () => {
  const state = { ...demo(), now: at(0, '12:10') };
  const { blocks } = planSchedule(state);
  assert.ok(blocks.every((block) => block.start >= state.now));
});

test('diffPlans empareja bloques movidos de la misma tarea', () => {
  const before = [{ id: 'a', taskId: 't', start: 600, end: 720, done: false }];
  const after = [{ id: 'b', taskId: 't', start: 2040, end: 2160, done: false }];
  assert.deepEqual(diffPlans(before, after), [{ type: 'move', taskId: 't', from: [600, 720], to: [2040, 2160] }]);
});

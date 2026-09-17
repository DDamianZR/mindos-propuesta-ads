import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDemoData } from '../src/data/seed.js';
import { createProposal } from '../src/domain/planner.js';
import { analyzeWeek, levelOf } from '../src/domain/workload.js';
import { at } from '../src/domain/time.js';

const demo = () => createDemoData(new Date(2026, 8, 16));
const moveQuiz = (state) => ({
  ...state,
  tasks: state.tasks.map((task) => (task.id === 'pye-quiz2' ? { ...task, due: at(3, '07:00') } : task)),
});

test('los niveles de carga distinguen holgado, justo, extendido y sobrecarga', () => {
  assert.equal(levelOf({ demand: 0, capacity: 180, free: 600, unplanned: 0 }), 'free');
  assert.equal(levelOf({ demand: 120, capacity: 180, free: 600, unplanned: 0 }), 'ok');
  assert.equal(levelOf({ demand: 170, capacity: 180, free: 600, unplanned: 0 }), 'tight');
  assert.equal(levelOf({ demand: 220, capacity: 180, free: 600, unplanned: 0 }), 'tight');
  assert.equal(levelOf({ demand: 220, capacity: 180, free: 600, unplanned: 60 }), 'over');
  assert.equal(levelOf({ demand: 700, capacity: 180, free: 600, unplanned: 0 }), 'over');
});

test('la semana inicial de la demo es exigente pero viable', () => {
  const analysis = analyzeWeek(demo());
  assert.deepEqual(analysis.issues, []);
  assert.ok(analysis.days.every((day) => day.level !== 'over'));
  assert.ok(analysis.totals.demand < analysis.totals.capacity);
});

test('adelantar el quiz deja bloques después de la fecha y satura el miércoles', () => {
  const analysis = analyzeWeek(moveQuiz(demo()));
  const late = analysis.issues.find((issue) => issue.type === 'late-blocks');
  const overload = analysis.issues.find((issue) => issue.type === 'overload');
  assert.equal(late?.taskId, 'pye-quiz2');
  assert.equal(overload?.day, 2);
  assert.equal(analysis.days[2].level, 'over');
  assert.ok(analysis.days[2].unplanned > 0);
  assert.deepEqual(analysis.days[3].deadlines, ['pye-quiz2', 'ads-casos-uso', 'bd-normalizacion']);
});

test('aplicar la propuesta deja la semana sin problemas', () => {
  const state = moveQuiz(demo());
  const proposal = createProposal(state);
  const analysis = analyzeWeek({ ...state, blocks: proposal.blocks });
  assert.deepEqual(analysis.issues, []);
});

test('completar bloques cuenta como trabajo hecho del día', () => {
  const state = demo();
  const first = state.blocks[0];
  const analysis = analyzeWeek({ ...state, blocks: state.blocks.map((block) => (block.id === first.id ? { ...block, done: true } : block)) });
  const day = analysis.days[Math.floor(first.start / 1440)];
  assert.equal(day.done, first.end - first.start);
});

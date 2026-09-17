// Pruebas directas del reducer: cada transición es pura y se puede verificar sin la app.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actions, createInitialState, reducer } from '../src/app/reducer.js';
import { at } from '../src/domain/time.js';

const today = () => new Date(2026, 8, 16);

test('taskDone quita solo los bloques futuros no hechos de esa tarea', () => {
  let state = createInitialState({ today: today() });
  const otherBlocks = state.data.blocks.filter((block) => block.taskId !== 'bd-proyecto-er');
  const [firstBlock] = state.data.blocks.filter((block) => block.taskId === 'bd-proyecto-er');

  state = reducer(state, actions.blockDone(firstBlock.id, true));
  state = reducer(state, actions.proposalReady({ blocks: state.data.blocks, changes: [], unplaced: [] }));
  state = reducer(state, actions.taskDone('bd-proyecto-er', true));

  const remaining = state.data.blocks.filter((block) => block.taskId === 'bd-proyecto-er');
  assert.deepEqual(remaining.map((block) => block.id), [firstBlock.id]);
  assert.equal(remaining[0].done, true);
  assert.deepEqual(state.data.blocks.filter((block) => block.taskId !== 'bd-proyecto-er'), otherBlocks);
  assert.equal(state.proposal.status, 'idle');
});

test('blockDone alterna el estado de un bloque sin tocar los demás', () => {
  let state = createInitialState({ today: today() });
  const [block, ...others] = state.data.blocks;

  state = reducer(state, actions.blockDone(block.id, true));
  assert.equal(state.data.blocks.find((item) => item.id === block.id).done, true);
  assert.deepEqual(state.data.blocks.filter((item) => item.id !== block.id), others);

  state = reducer(state, actions.blockDone(block.id, false));
  assert.equal(state.data.blocks.find((item) => item.id === block.id).done, false);
});

test('proposalReady seguido de proposalApplied reemplaza data.blocks', () => {
  let state = createInitialState({ today: today() });
  const proposal = { blocks: [{ id: 'blk-fake', taskId: 'x', start: 0, end: 30, done: false }], changes: [], unplaced: [] };

  state = reducer(state, actions.proposalReady(proposal));
  assert.equal(state.proposal.status, 'ready');

  state = reducer(state, actions.proposalApplied());
  assert.deepEqual(state.data.blocks, proposal.blocks);
  assert.equal(state.proposal.status, 'idle');
});

test('messageAdded gestiona chat.pending según el remitente', () => {
  let state = createInitialState({ today: today() });

  state = reducer(state, actions.messageAdded({ from: 'mindos', text: 'hola', pending: { type: 'rebalance' } }));
  assert.deepEqual(state.chat.pending, { type: 'rebalance' });

  state = reducer(state, actions.messageAdded({ from: 'user', text: 'sí' }));
  assert.deepEqual(state.chat.pending, { type: 'rebalance' });

  state = reducer(state, actions.messageAdded({ from: 'mindos', text: 'listo' }));
  assert.equal(state.chat.pending, null);
});

test('navigate a assistant limpia los mensajes sin leer', () => {
  let state = createInitialState({ today: today() });
  state = reducer(state, actions.messageAdded({ from: 'mindos', text: 'hola' }));
  assert.equal(state.chat.unread, 1);

  state = reducer(state, actions.navigate('assistant'));
  assert.equal(state.chat.unread, 0);
});

test('syncFinished aplica los cambios remotos de las fuentes indicadas', () => {
  let state = createInitialState({ today: today() });
  state = reducer(state, actions.syncFinished(['teams']));

  const quiz = state.data.tasks.find((task) => task.id === 'pye-quiz2');
  assert.equal(quiz.due, at(3, '07:00'));
  assert.ok(state.data.activity.some((entry) => entry.change?.taskId === 'pye-quiz2'));
  assert.equal(state.data.remoteChanges.some((change) => change.sourceId === 'teams'), false);
});

test('clockAdvanced no invalida una propuesta lista', () => {
  let state = createInitialState({ today: today() });
  state = reducer(state, actions.proposalReady({ blocks: state.data.blocks, changes: [], unplaced: [] }));

  state = reducer(state, actions.clockAdvanced(30));
  assert.equal(state.proposal.status, 'ready');
});

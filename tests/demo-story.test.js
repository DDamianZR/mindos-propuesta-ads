// Contrato de la demo: la historia que se presenta debe seguir funcionando.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCommands } from '../src/app/commands.js';
import { createPersistence } from '../src/app/persistence.js';
import { createInitialState, reducer } from '../src/app/reducer.js';
import { createStore } from '../src/app/store.js';
import { ruleBasedAssistant } from '../src/assistant/engine.js';
import { at } from '../src/domain/time.js';
import { analyzeWeek } from '../src/domain/workload.js';

const today = () => new Date(2026, 8, 16);

function setup({ delay = async () => {} } = {}) {
  const store = createStore(reducer, createInitialState({ today: today() }));
  const toasts = [];
  const commands = createCommands({ store, assistant: ruleBasedAssistant, delay, today, notify: (toast) => toasts.push(toast) });
  const lastMessage = () => store.getState().chat.messages.at(-1);
  return { store, commands, toasts, lastMessage };
}

test('la historia completa: resumen, cambio detectado, propuesta y plan aplicado', async () => {
  const { store, commands, toasts, lastMessage } = setup();

  await commands.start();
  assert.match(lastMessage().text, /^Buenos días, Valeria/);

  await commands.ask({ text: '¿Qué tengo hoy?' });
  assert.match(lastMessage().text, /Bases de Datos/);

  await commands.syncAll();
  await commands.idle();
  const quiz = store.getState().data.tasks.find((task) => task.id === 'pye-quiz2');
  assert.equal(quiz.due, at(3, '07:00'));
  assert.equal(toasts.at(-1).message, 'Se detectó 1 cambio');
  assert.equal(lastMessage().tone, 'alert');
  assert.match(lastMessage().text, /adelantó \*Quiz 2: distribuciones discretas\*/);
  assert.deepEqual(store.getState().chat.pending, { type: 'rebalance' });
  assert.ok(analyzeWeek(store.getState().data).issues.length > 0);

  await commands.ask({ label: 'Reorganizar semana', intent: 'rebalance' });
  assert.equal(store.getState().proposal.status, 'ready');
  assert.match(lastMessage().text, /^Te propongo esto/);

  await commands.ask({ text: 'sí' });
  assert.equal(store.getState().proposal.status, 'idle');
  assert.equal(lastMessage().tone, 'success');
  assert.deepEqual(analyzeWeek(store.getState().data).issues, []);
});

test('confirmar la pregunta «¿Reorganizo tu semana?» genera la propuesta', async () => {
  const { store, commands, lastMessage } = setup();
  await commands.syncAll();
  await commands.idle();
  await commands.ask({ text: 'va' });
  assert.equal(store.getState().proposal.status, 'ready');
  assert.match(lastMessage().text, /¿Aplico los cambios\?$/);
});

test('reorganizar desde la app avisa también por WhatsApp y se puede deshacer', async () => {
  const { store, commands, toasts, lastMessage } = setup();
  await commands.syncAll();
  await commands.idle();
  const before = store.getState().data.blocks;

  await commands.requestProposal();
  commands.applyProposal();
  await commands.idle();
  assert.match(lastMessage().text, /^Actualicé tu plan desde la app/);
  assert.notDeepEqual(store.getState().data.blocks, before);

  toasts.at(-1).action.run();
  assert.deepEqual(store.getState().data.blocks, before);
});

test('marcar una tarea como terminada desde el chat actualiza la app', async () => {
  const { store, commands } = setup();
  await commands.ask({ text: 'Ya terminé el reporte de VLSM' });
  const { data } = store.getState();
  assert.equal(data.tasks.find((task) => task.id === 'redes-vlsm').done, true);
  assert.ok(!data.blocks.some((block) => block.taskId === 'redes-vlsm'));
});

test('reiniciar mientras MindOS escribe no deja respuestas huérfanas', async () => {
  const waiting = [];
  const delay = () => new Promise((resolve) => waiting.push(resolve));
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const { store, commands } = setup({ delay });

  commands.ask({ text: '¿Qué tengo hoy?' });
  await flush();
  commands.resetDemo();
  while (waiting.length > 0) {
    waiting.shift()();
    await flush();
  }
  await commands.idle();

  const { messages } = store.getState().chat;
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /^Buenos días/);
  assert.equal(store.getState().chat.typing, false);
});

test('la persistencia tolera almacenamiento dañado o inaccesible', () => {
  const broken = {
    getItem: () => '{no es json',
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const persistence = createPersistence(broken);
  assert.deepEqual(persistence.load('2026-09-14'), { prefs: null, session: null });
  assert.doesNotThrow(() => persistence.save(createInitialState({ today: today() })));
});

test('la sesión guardada solo se recupera en la misma semana', () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const persistence = createPersistence(storage);
  const state = createInitialState({ today: today() });
  persistence.save({ ...state, prefs: { ...state.prefs, theme: 'dark' } });

  assert.equal(persistence.load('2026-09-14').session.data.weekStart, '2026-09-14');
  const nextWeek = persistence.load('2026-09-21');
  assert.equal(nextWeek.session, null);
  assert.equal(nextWeek.prefs.theme, 'dark');
});

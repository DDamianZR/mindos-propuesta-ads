import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/app/reducer.js';
import { BUTTONS, respond } from '../src/assistant/engine.js';
import { detectIntent, matchTasks, normalize } from '../src/assistant/intents.js';

const state = () => createInitialState({ today: new Date(2026, 8, 16) });

test('normaliza acentos, mayúsculas y signos', () => {
  assert.equal(normalize('¿Qué tengo MAÑANA?'), 'que tengo manana');
});

test('reconoce las preguntas frecuentes de un estudiante', () => {
  const cases = {
    '¿Qué tengo hoy?': 'today',
    '¿Qué tengo mañana?': 'tomorrow',
    'Tareas de mañana': 'tomorrow',
    '¿Tengo reuniones hoy?': 'meetings',
    'Planifica mi estudio': 'plan',
    '¿Cómo va mi semana?': 'week',
    'Mis entregas de la semana': 'deadlines',
    '¿Me da tiempo con todo?': 'week',
    'Reorganiza mi semana': 'rebalance',
    'Ya terminé el reporte de VLSM': 'complete',
    '¿Qué hago ahora?': 'next',
    '¿Hay cambios?': 'changes',
    'Estoy muy cansada': 'sleep',
    'hola': 'greeting',
    'gracias!': 'thanks',
    'asdfgh': 'unknown',
  };
  for (const [text, intent] of Object.entries(cases)) {
    assert.equal(detectIntent(text).intent, intent, text);
  }
});

test('«sí» y «no» solo cuentan cuando hay una pregunta abierta', () => {
  assert.equal(detectIntent('sí').intent, 'unknown');
  assert.equal(detectIntent('sí', { pending: { type: 'proposal' } }).intent, 'confirm');
  assert.equal(detectIntent('no, ahora no', { pending: { type: 'proposal' } }).intent, 'decline');
});

test('identifica la tarea que el estudiante menciona', () => {
  const { tasks } = state().data;
  assert.equal(matchTasks('ya terminé el reporte de vlsm', tasks)[0].task.id, 'redes-vlsm');
  assert.equal(matchTasks('acabé los diagramas de casos de uso', tasks)[0].task.id, 'ads-casos-uso');
  assert.equal(matchTasks('ya quedó la normalización', tasks)[0].task.id, 'bd-normalizacion');
});

test('la agenda de hoy usa los mismos datos que la app', () => {
  const { replies } = respond(state(), { text: '¿Qué tengo hoy?' });
  assert.match(replies[0].text, /07:00–08:30 Bases de Datos/);
  assert.match(replies[0].text, /10:30–11:30 Estudio: Revisar mockups del equipo/);
  assert.match(replies[0].text, /No agendo estudio después de las 22:00/);
});

test('si no identifica la tarea, pregunta con botones válidos para WhatsApp', () => {
  const { replies, actions } = respond(state(), { text: 'ya terminé' });
  assert.equal(actions.length, 0);
  assert.equal(replies[0].text, '¿Cuál terminaste?');
  assert.ok(replies[0].buttons.length <= 3);
  assert.ok(replies[0].buttons.every((button) => button.label.length <= 20));
});

test('todos los botones respetan los límites de WhatsApp', () => {
  for (const button of Object.values(BUTTONS)) assert.ok(button.label.length <= 20, button.label);
  for (const task of state().data.tasks) assert.ok(task.short.length <= 20, task.short);
});

test('las respuestas desconocidas orientan en lugar de fallar', () => {
  const { intent, replies } = respond(state(), { text: 'blablabla' });
  assert.equal(intent, 'unknown');
  assert.equal(replies[0].buttons.length, 3);
});

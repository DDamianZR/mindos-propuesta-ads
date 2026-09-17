import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dueChangeText, issueText, workScheduleText } from '../src/shared/copy.js';
import { createDemoData } from '../src/data/seed.js';
import { at } from '../src/domain/time.js';
import {
  formatAgo,
  formatDay,
  formatDueIn,
  formatDuration,
  formatHours,
  greetingFor,
  joinList,
  relativeDay,
} from '../src/shared/format.js';

const week = { weekStart: '2026-09-14', now: at(0, '06:50') };

test('las duraciones se leen como las diría una persona', () => {
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(120), '2 h');
  assert.equal(formatDuration(90), '1 h 30 min');
  assert.equal(formatHours(90), '1.5 h');
  assert.equal(formatHours(240), '4 h');
});

test('las fechas usan español de México sin depender de Intl', () => {
  assert.equal(formatDay(week.weekStart, 0), 'lunes 14 de septiembre');
  assert.equal(formatDay(week.weekStart, 2, { short: true }), 'mié 16');
  assert.equal(formatDay(week.weekStart, 17), 'jueves 1 de octubre');
});

test('los días relativos se adaptan a la distancia', () => {
  assert.equal(relativeDay(week.weekStart, 0, week.now), 'hoy');
  assert.equal(relativeDay(week.weekStart, 1, week.now), 'mañana');
  assert.equal(relativeDay(week.weekStart, 3, week.now), 'el jueves');
  assert.equal(relativeDay(week.weekStart, 8, week.now), 'el martes 22 de septiembre');
});

test('vencimientos, antigüedad y saludos', () => {
  assert.equal(formatDueIn(at(0, '23:59'), week.now), 'vence hoy');
  assert.equal(formatDueIn(at(3, '07:00'), week.now), 'vence en 3 días');
  assert.equal(formatDueIn(at(-1, '23:59'), week.now), 'venció ayer');
  assert.equal(formatAgo(week.now - 5, week.now), 'hace 5 min');
  assert.equal(formatAgo(at(-3, '10:00'), week.now), 'hace 3 días');
  assert.equal(greetingFor(at(0, '06:50')), 'Buenos días');
  assert.equal(greetingFor(at(0, '20:00')), 'Buenas noches');
  assert.equal(joinList(['Ana', 'Carlos', 'Sofía']), 'Ana, Carlos y Sofía');
});

test('los textos compartidos dicen lo mismo en la app y en WhatsApp', () => {
  const task = { title: 'Quiz 2: distribuciones discretas' };
  const change = { actor: 'La Dra. Elena Sánchez', from: at(8, '07:00'), to: at(3, '07:00') };
  assert.equal(
    dueChangeText(change, task, week),
    'La Dra. Elena Sánchez adelantó «Quiz 2: distribuciones discretas» al jueves a las 07:00. Antes era el martes 22 de septiembre a las 07:00.',
  );
  assert.match(dueChangeText(change, task, week, (title) => `*${title}*`), /adelantó \*Quiz 2/);
  assert.equal(
    issueText({ type: 'overload', day: 2, demand: 240, capacity: 180 }, { tasks: [] }),
    'El miércoles tendrías 4 h de trabajo para 3 h de enfoque.',
  );
});

test('el horario de trabajo se deriva de los turnos de la primera semana', () => {
  const data = createDemoData(new Date(2026, 8, 16));
  assert.equal(workScheduleText(data), 'martes y jueves por la tarde');
  assert.equal(workScheduleText({ events: [] }), null);
});

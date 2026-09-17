// Pendientes: todas las entregas en una sola lista, sin importar la plataforma.

import { effortLeft, pendingTasks, urgencyOf } from '../../domain/tasks.js';
import { capitalize, formatDueIn, formatDuration, formatMoment, plural } from '../../shared/format.js';
import { button, courseTag, createLookup, emptyState, sourceTag } from '../components.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { planStatus, viewHeader } from './shared.js';

const GROUPS = [
  { key: 'overdue', title: 'Vencidas' },
  { key: 'today', title: 'Vencen hoy' },
  { key: 'tomorrow', title: 'Vencen mañana' },
  { key: 'week', title: 'Esta semana' },
  { key: 'later', title: 'Más adelante' },
];

export function renderTasks(state, { commands, analysis }) {
  const { data, ui } = state;
  const lookup = createLookup(data);
  const pending = pendingTasks(data.tasks);
  const completed = data.tasks.filter((task) => task.done);
  const sourceIds = [...new Set(pending.map((task) => task.sourceId))];
  const filter = ui.taskFilter === 'all' || sourceIds.includes(ui.taskFilter) ? ui.taskFilter : 'all';
  const visible = filter === 'all' ? pending : pending.filter((task) => task.sourceId === filter);
  const totalLeft = pending.reduce((sum, task) => sum + effortLeft(task, data.blocks), 0);
  const context = { data, analysis, lookup, commands };

  return h(
    'div',
    { class: 'view view--tasks' },
    viewHeader({
      title: 'Pendientes',
      lede: `${plural(pending.length, 'pendiente')} de ${plural(sourceIds.length, 'plataforma')}. ${formatDuration(totalLeft)} de trabajo estimado.`,
    }),
    h(
      'div',
      { class: 'segmented filters', role: 'group', 'aria-label': 'Filtrar por plataforma' },
      filterButton({ id: 'all', label: 'Todas', count: pending.length, filter, commands }),
      sourceIds.map((sourceId) =>
        filterButton({
          id: sourceId,
          label: lookup.source(sourceId).name,
          count: pending.filter((task) => task.sourceId === sourceId).length,
          filter,
          commands,
        }),
      ),
    ),
    h(
      'div',
      { class: 'task-groups', 'data-tour': 'tasks' },
      visible.length === 0
        ? emptyState({
            iconName: 'check',
            title: filter === 'all' ? 'No tienes pendientes' : `Nada pendiente en ${lookup.source(filter).name}`,
            body: filter === 'all' ? 'Buen momento para adelantar tu proyecto o descansar.' : 'Revisa las demás plataformas.',
            action: filter === 'all' ? null : button({ label: 'Ver todas', onClick: () => commands.filterTasks('all') }),
          })
        : GROUPS.map(({ key, title }) => {
            const items = visible.filter((task) => urgencyOf(task, data.now) === key);
            if (items.length === 0) return null;
            return h(
              'section',
              { class: 'task-group', 'aria-labelledby': `group-${key}` },
              h('h2', { class: 'task-group__title', id: `group-${key}` }, title, h('span', { class: 'task-group__count tabular' }, items.length)),
              h('ul', { class: 'task-list' }, items.map((task) => taskRow(task, context))),
            );
          }),
    ),
    completed.length > 0 &&
      h(
        'details',
        { class: 'task-done' },
        h('summary', {}, icon('chevronDown', { size: 18 }), `Completadas (${completed.length})`),
        h('ul', { class: 'task-list' }, completed.map((task) => taskRow(task, context))),
      ),
  );
}

function filterButton({ id, label, count, filter, commands }) {
  return h(
    'button',
    {
      type: 'button',
      class: 'segmented__item',
      'aria-pressed': String(filter === id),
      dataset: { focusKey: `filter-${id}` },
      onClick: () => commands.filterTasks(id),
    },
    label,
    h('span', { class: 'segmented__count tabular', 'aria-label': plural(count, 'pendiente') }, count),
  );
}

function taskRow(task, { data, analysis, lookup, commands }) {
  const inputId = `task-${task.id}`;
  const left = effortLeft(task, data.blocks);
  const urgent = !task.done && ['overdue', 'today', 'tomorrow'].includes(urgencyOf(task, data.now));

  return h(
    'li',
    { class: ['task-row', task.done && 'is-done'] },
    h('input', {
      type: 'checkbox',
      class: 'check',
      id: inputId,
      checked: task.done,
      'aria-describedby': `${inputId}-due`,
      dataset: { focusKey: inputId },
      onChange: (event) => commands.setTaskDone(task.id, event.target.checked),
    }),
    h(
      'div',
      { class: 'task-row__body' },
      h('label', { class: 'task-row__title', for: inputId }, task.title),
      h(
        'p',
        { class: 'task-row__meta' },
        courseTag(lookup.course(task.courseId)),
        sourceTag(lookup.source(task.sourceId)),
        !task.done &&
          h('span', { class: 'task-row__effort' }, icon('clock', { size: 14 }), left > 0 ? `Faltan ${formatDuration(left)}` : 'Solo falta entregar'),
        planStatus(task, data, analysis),
      ),
    ),
    h(
      'p',
      { class: 'task-row__due', id: `${inputId}-due` },
      h('span', { class: 'task-row__moment tabular' }, formatMoment(data.weekStart, task.due)),
      h('span', { class: ['task-row__relative', urgent && 'is-urgent'] }, task.done ? 'Terminada' : capitalize(formatDueIn(task.due, data.now))),
    ),
  );
}

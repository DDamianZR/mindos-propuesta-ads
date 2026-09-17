// Hoy: qué está pasando, qué sigue y cómo se reparte el día.

import { agendaForDay, currentAndNext } from '../../domain/agenda.js';
import { studyCutoff } from '../../domain/calendar.js';
import { pendingTasks } from '../../domain/tasks.js';
import { dateOfDay, dayOf } from '../../domain/time.js';
import {
  capitalize,
  formatClock,
  formatDay,
  formatDueIn,
  formatDuration,
  formatRange,
  greetingFor,
  plural,
  weekdayName,
} from '../../shared/format.js';
import { button, courseTag, createLookup, levelBadge, sectionHeader, sourceTag } from '../components.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { ITEM_KINDS, planStatus, viewHeader } from './shared.js';

const LEVEL_COLORS = { free: 'var(--ok-fill)', ok: 'var(--ok-fill)', tight: 'var(--tight-fill)', over: 'var(--over-fill)' };

export function renderToday(state, { commands, analysis, startTour }) {
  const { data, prefs } = state;
  const lookup = createLookup(data);
  const today = dayOf(data.now);
  const agenda = agendaForDay(data, today);

  return h(
    'div',
    { class: 'view view--today' },
    !prefs.welcomeDismissed && welcomeCard(data, commands, startTour),
    viewHeader({
      title: `${greetingFor(data.now)}, ${data.profile.name}`,
      lede: `${capitalize(formatDay(data.weekStart, today))}, ${formatClock(data.now)}`,
    }),
    h('div', { class: 'today-top' }, focusCard(data, lookup, commands), daySummary(data, analysis.days[today], agenda)),
    h(
      'section',
      { class: 'section', 'aria-labelledby': 'agenda-title' },
      sectionHeader({ title: 'Agenda de hoy', id: 'agenda-title' }),
      timeline(data, agenda, lookup, commands),
    ),
    h(
      'section',
      { class: 'section', 'aria-labelledby': 'upcoming-title' },
      sectionHeader({
        title: 'Próximas entregas',
        id: 'upcoming-title',
        action: button({ label: 'Ver pendientes', variant: 'ghost', size: 'sm', onClick: () => commands.navigate('tasks') }),
      }),
      upcomingDeadlines(data, analysis, lookup),
    ),
  );
}

function welcomeCard(data, commands, startTour) {
  const { profile } = data;
  return h(
    'section',
    { class: 'card welcome', 'aria-labelledby': 'welcome-title' },
    h(
      'div',
      { class: 'welcome__body' },
      h('h2', { class: 'welcome__title', id: 'welcome-title' }, `Esta es la semana de ${profile.name}`),
      h(
        'p',
        {},
        `Estudia ${profile.semester}.º semestre de ${profile.program} y trabaja martes y jueves por la tarde. Sus profesores publican en ${data.sources.length} plataformas distintas: MindOS las junta, detecta cuándo la semana deja de alcanzar y le propone qué hacer.`,
      ),
      h('p', { class: 'welcome__note' }, icon('info', { size: 16 }), 'Datos simulados. Nada se conecta a cuentas reales.'),
    ),
    h(
      'div',
      { class: 'welcome__actions' },
      button({ label: 'Ver demo guiada', variant: 'primary', iconName: 'play', onClick: startTour }),
      button({ label: 'Explorar por mi cuenta', variant: 'ghost', onClick: () => commands.dismissWelcome() }),
    ),
  );
}

function itemTitle(item) {
  return item.kind === 'study' ? item.task.title : item.title;
}

function focusCard(data, lookup, commands) {
  const { current, next, later } = currentAndNext(data);
  const item = current ?? next;
  if (!item) {
    return h(
      'section',
      { class: 'card focus-card', 'aria-labelledby': 'focus-title' },
      h('p', { class: 'focus-card__label' }, icon('check'), 'Por hoy es todo'),
      h('h2', { class: 'focus-card__title', id: 'focus-title' }, 'No te queda nada agendado'),
      h('p', { class: 'focus-card__after' }, 'Mañana MindOS te manda tu resumen a las 06:45.'),
    );
  }

  const kind = ITEM_KINDS[item.kind];
  const minutesAway = item.start - data.now;
  const label = current ? 'Ahora' : minutesAway <= 90 ? `En ${formatDuration(minutesAway)}` : `A las ${formatClock(item.start)}`;
  const course = lookup.course(item.event?.courseId ?? item.task?.courseId);
  const after = current ? next : later[0];

  return h(
    'section',
    { class: ['card', 'focus-card', item.kind === 'study' && 'focus-card--study'], 'aria-labelledby': 'focus-title' },
    h('div', { class: 'focus-card__top' }, h('p', { class: 'focus-card__label' }, icon(kind.icon), label), courseTag(course)),
    h('h2', { class: 'focus-card__title', id: 'focus-title' }, itemTitle(item)),
    h(
      'ul',
      { class: 'focus-card__facts' },
      h('li', { class: 'tabular' }, icon('clock', { size: 16 }), formatRange(item.start, item.end)),
      item.event?.location && h('li', {}, icon('pin', { size: 16 }), item.event.location),
      item.kind === 'study' && h('li', {}, icon('focus', { size: 16 }), 'Bloque planeado por MindOS'),
    ),
    item.kind === 'study' &&
      !item.block.done &&
      button({
        label: 'Marcar bloque como hecho',
        iconName: 'check',
        size: 'sm',
        focusKey: `focus-done-${item.block.id}`,
        onClick: () => commands.setBlockDone(item.block.id, true),
      }),
    after && h('p', { class: 'focus-card__after' }, 'Después: ', h('strong', {}, itemTitle(after)), ` a las ${formatClock(after.start)}`),
  );
}

function daySummary(data, stats, agenda) {
  const studied = stats.done + stats.planned;
  const commitments = agenda.items.filter((item) => item.kind !== 'study');
  const classes = commitments.filter((item) => item.kind === 'class').length;
  const others = commitments.length - classes;
  const percent = stats.limit > 0 ? Math.min(100, Math.round((studied / stats.limit) * 100)) : 0;

  return h(
    'section',
    { class: 'well day-summary', 'aria-labelledby': 'summary-title' },
    h('div', { class: 'day-summary__head' }, h('h2', { class: 'day-summary__title', id: 'summary-title' }, 'Estudio planeado'), levelBadge(stats.level)),
    h(
      'p',
      { class: 'day-summary__value tabular' },
      formatDuration(studied),
      h('span', { class: 'day-summary__limit' }, ` de ${formatDuration(stats.limit)}`),
    ),
    h(
      'div',
      { class: 'meter', role: 'img', 'aria-label': `${formatDuration(studied)} de ${formatDuration(stats.limit)} de enfoque` },
      h('div', { class: 'meter__fill', style: { '--value': `${percent}%`, '--meter-color': LEVEL_COLORS[stats.level] } }),
    ),
    h(
      'ul',
      { class: 'day-summary__facts' },
      h('li', {}, icon('book', { size: 16 }), [plural(classes, 'clase'), others > 0 && ` y ${plural(others, 'compromiso')}`]),
      h('li', {}, icon('flag', { size: 16 }), agenda.deadlines.length > 0 ? `${plural(agenda.deadlines.length, 'entrega')} para hoy` : 'Nada vence hoy'),
      h('li', {}, icon('moon', { size: 16 }), `Sin estudio después de las ${formatClock(studyCutoff(data.profile))}`),
    ),
  );
}

function timeline(data, agenda, lookup, commands) {
  const entries = [
    ...agenda.items.map((item) => ({ at: item.start, item })),
    ...agenda.deadlines.map((task) => ({ at: task.due, task })),
  ].sort((a, b) => a.at - b.at);

  if (entries.length === 0) {
    return h('p', { class: 'muted' }, 'Hoy no tienes clases, compromisos ni bloques de estudio.');
  }

  const rows = [];
  let nowPlaced = false;
  for (const entry of entries) {
    if (!nowPlaced && entry.at > data.now) {
      rows.push(nowMarker(data.now));
      nowPlaced = true;
    }
    rows.push(entry.item ? agendaRow(entry.item, data, lookup, commands) : deadlineRow(entry.task, lookup));
  }
  if (!nowPlaced) rows.push(nowMarker(data.now));
  return h('ol', { class: 'timeline' }, rows);
}

function nowMarker(now) {
  return h(
    'li',
    { class: 'now-marker' },
    h('span', { class: 'now-marker__time tabular', 'aria-hidden': 'true' }, formatClock(now)),
    h('span', { class: 'now-marker__line' }, h('span', { class: 'sr-only' }, `Ahora son las ${formatClock(now)}`)),
  );
}

function agendaRow(item, data, lookup, commands) {
  const kind = ITEM_KINDS[item.kind];
  const isStudy = item.kind === 'study';
  const course = lookup.course(item.event?.courseId ?? item.task?.courseId);
  const source = isStudy ? null : lookup.source(item.event.sourceId);
  const inputId = isStudy ? `block-${item.block.id}` : null;
  const detail = isStudy
    ? `Bloque de ${formatDuration(item.end - item.start)}`
    : item.event.location ?? kind.label;

  return h(
    'li',
    { class: ['slot', `slot--${item.kind}`, item.end <= data.now && 'is-past', item.block?.done && 'is-done'] },
    h('p', { class: 'slot__time tabular' }, formatClock(item.start), h('span', { class: 'slot__end' }, formatClock(item.end))),
    h(
      'div',
      { class: 'slot__card' },
      h('span', { class: 'slot__icon' }, icon(kind.icon, { size: 18 })),
      h(
        'div',
        { class: 'slot__body' },
        isStudy
          ? h('label', { class: 'slot__title', for: inputId }, item.task.title)
          : h('p', { class: 'slot__title' }, item.title),
        h(
          'p',
          { class: 'slot__meta' },
          h('span', { class: 'sr-only' }, `${kind.label}, ${formatRange(item.start, item.end)}. `),
          h('span', {}, detail),
          courseTag(course),
          sourceTag(source),
        ),
      ),
      isStudy &&
        h(
          'span',
          { class: 'slot__check' },
          h('input', {
            type: 'checkbox',
            class: 'check',
            id: inputId,
            checked: item.block.done,
            dataset: { focusKey: inputId },
            'aria-label': `Marcar como hecho el bloque de ${item.task.short}`,
            onChange: (event) => commands.setBlockDone(item.block.id, event.target.checked),
          }),
        ),
    ),
  );
}

function deadlineRow(task, lookup) {
  return h(
    'li',
    { class: 'slot slot--deadline' },
    h('p', { class: 'slot__time tabular' }, formatClock(task.due)),
    h(
      'div',
      { class: 'slot__card' },
      h('span', { class: 'slot__icon' }, icon('flag', { size: 18 })),
      h(
        'div',
        { class: 'slot__body' },
        h('p', { class: 'slot__title' }, `Vence: ${task.title}`),
        h('p', { class: 'slot__meta' }, courseTag(lookup.course(task.courseId)), sourceTag(lookup.source(task.sourceId))),
      ),
    ),
  );
}

function upcomingDeadlines(data, analysis, lookup) {
  const tasks = pendingTasks(data.tasks)
    .filter((task) => task.due > data.now)
    .slice(0, 3);
  if (tasks.length === 0) return h('p', { class: 'muted' }, 'No tienes entregas pendientes.');

  return h(
    'ul',
    { class: 'deadline-list' },
    tasks.map((task) =>
      h(
        'li',
        { class: 'deadline' },
        h(
          'p',
          { class: 'deadline__date', 'aria-hidden': 'true' },
          h('span', { class: 'deadline__weekday' }, weekdayName(dayOf(task.due), { short: true })),
          h('span', { class: 'deadline__day tabular' }, dateOfDay(data.weekStart, dayOf(task.due)).getDate()),
        ),
        h(
          'div',
          { class: 'deadline__body' },
          h('p', { class: 'deadline__title' }, task.title),
          h(
            'p',
            { class: 'deadline__meta' },
            h('span', {}, `${capitalize(formatDueIn(task.due, data.now))}, ${formatClock(task.due)}`),
            courseTag(lookup.course(task.courseId)),
            sourceTag(lookup.source(task.sourceId)),
          ),
        ),
        planStatus(task, data, analysis),
      ),
    ),
  );
}

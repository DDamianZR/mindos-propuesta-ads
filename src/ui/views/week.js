// Semana: el radar de carga, los conflictos y la propuesta de MindOS.

import { agendaForDay } from '../../domain/agenda.js';
import { studyCutoff } from '../../domain/calendar.js';
import { dateOfDay, dayOf } from '../../domain/time.js';
import { dueChangeText, issueText } from '../../shared/copy.js';
import {
  capitalize,
  formatClock,
  formatDay,
  formatDuration,
  formatHours,
  formatRange,
  joinList,
  plural,
  relativeDay,
  weekdayName,
} from '../../shared/format.js';
import { LEVELS, button, courseTag, createLookup, levelBadge, sectionHeader } from '../components.js';
import { h, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { viewHeader } from './shared.js';

// Altura previa de cada columna del radar, para animar solo lo que cambió.
const previousFill = new Map();
// Estado previo de la propuesta, para animarla solo cuando aparece o cambia.
let previousProposalStatus = 'idle';

export function renderWeek(state, { commands, analysis, viewChanged }) {
  const { data, ui } = state;
  const lookup = createLookup(data);
  const selected = ui.selectedDay ?? defaultDay(analysis);

  return h(
    'div',
    { class: 'view view--week' },
    viewHeader({
      title: 'Tu semana',
      lede: `Del ${formatDay(data.weekStart, 0)} al ${formatDay(data.weekStart, 6)}. ${formatDuration(analysis.totals.demand)} de trabajo para ${formatDuration(analysis.totals.capacity)} de enfoque disponible.`,
    }),
    statusPanel(state, analysis, lookup, commands),
    proposalPanel(state, lookup, commands),
    radarCard(state, analysis, commands, selected, viewChanged),
    dayDetail(state, analysis, lookup, selected),
    sleepCard(data),
  );
}

/** Sin selección, muestra el día con problemas o, si no hay, hoy. */
function defaultDay(analysis) {
  return analysis.issues.find((issue) => issue.type === 'overload')?.day ?? Math.min(analysis.today, 6);
}

function statusPanel(state, analysis, lookup, commands) {
  const { data, proposal, sync } = state;
  const syncing = sync.syncing.length > 0;

  if (analysis.issues.length === 0) {
    return h(
      'section',
      { class: 'well week-status', 'aria-label': 'Estado de la semana' },
      h('span', { class: 'week-status__icon' }, icon('shield', { size: 22 })),
      h(
        'div',
        { class: 'week-status__body' },
        h('p', { class: 'week-status__title', tabindex: '-1', 'data-focus-fallback': '' }, 'Tu semana es viable'),
        h('p', { class: 'muted' }, 'Todo cabe antes de su fecha límite y dentro de tus límites de enfoque.'),
      ),
      button({
        label: syncing ? 'Revisando…' : 'Buscar cambios',
        iconName: 'refresh',
        size: 'sm',
        busy: syncing,
        disabled: syncing,
        focusKey: 'week-sync',
        onClick: () => commands.syncAll(),
      }),
    );
  }

  const overload = analysis.issues.find((issue) => issue.type === 'overload');
  const late = analysis.issues.find((issue) => issue.type === 'late-blocks');
  const title = overload
    ? `El ${weekdayName(overload.day)} ya no te alcanza`
    : late
      ? 'Tienes estudio después de una fecha límite'
      : 'Tienes entregas vencidas';
  const latestChange = [...data.activity].reverse().find((entry) => entry.change);
  const changeTask = latestChange && lookup.task(latestChange.change.taskId);

  return h(
    'section',
    { class: 'card alert', 'aria-labelledby': 'alert-title' },
    h('span', { class: 'alert__icon' }, icon('alert', { size: 22 })),
    h(
      'div',
      { class: 'alert__body' },
      h('h2', { class: 'alert__title', id: 'alert-title' }, title),
      changeTask && h('p', { class: 'alert__cause' }, dueChangeText(latestChange.change, changeTask, data)),
      h('ul', { class: 'alert__list' }, analysis.issues.map((issue) => h('li', {}, issueText(issue, data)))),
      proposal.status === 'idle' &&
        h(
          'div',
          { class: 'alert__actions' },
          button({
            label: 'Reorganizar semana',
            variant: 'primary',
            iconName: 'sparkle',
            focusKey: 'request-proposal',
            onClick: () => commands.requestProposal(),
          }),
          latestChange && button({ label: 'Ver el cambio', variant: 'ghost', onClick: () => commands.navigate('sources') }),
        ),
    ),
  );
}

function proposalPanel(state, lookup, commands) {
  const { proposal, data } = state;
  const entering = proposal.status !== previousProposalStatus;
  previousProposalStatus = proposal.status;
  if (proposal.status === 'idle') return null;
  const panelClass = ['card', 'proposal', entering && 'is-entering'];

  const head = (title, summary) =>
    h(
      'div',
      { class: 'proposal__head' },
      h('span', { class: 'proposal__icon' }, icon('sparkle', { size: 22 })),
      h(
        'div',
        {},
        h('h2', { class: 'proposal__title', id: 'proposal-title', tabindex: '-1', 'data-focus-fallback': '' }, title),
        h('p', { class: 'proposal__summary' }, summary),
      ),
    );

  if (proposal.status === 'loading') {
    return h(
      'section',
      { class: panelClass, 'data-tour': 'proposal', 'aria-busy': 'true', 'aria-labelledby': 'proposal-title' },
      head('Buscando la mejor reorganización', 'Reviso huecos antes de cada fecha límite, sin tocar tus horas de sueño.'),
      h('div', { class: 'proposal__skeleton', 'aria-hidden': 'true' }, h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' })),
    );
  }

  const value = proposal.value;
  const cutoff = formatClock(studyCutoff(data.profile));

  if (value.changes.length === 0 && value.unplaced.length === 0) {
    return h(
      'section',
      { class: panelClass, 'data-tour': 'proposal', 'aria-labelledby': 'proposal-title' },
      head('Tu semana ya está en orden', 'No hace falta mover nada: todo cabe antes de su fecha y dentro de tus límites.'),
      h('div', { class: 'proposal__actions' }, button({ label: 'Cerrar', onClick: () => commands.dismissProposal() })),
    );
  }

  const moment = (range) => `${capitalize(relativeDay(data.weekStart, dayOf(range[0]), data.now))}, ${formatRange(range[0], range[1])}`;
  const summary = `${plural(value.changes.length, 'cambio')}. ${
    value.issuesAfter === 0 ? 'Resuelve todos los conflictos de tu semana.' : 'Mejora tu semana, aunque quedan detalles por resolver.'
  }`;
  const relieved = value.impact.filter((entry) => entry.before !== entry.after);

  return h(
    'section',
    { class: panelClass, 'data-tour': 'proposal', 'aria-labelledby': 'proposal-title' },
    head('Propuesta de MindOS', summary),
    h(
      'ol',
      { class: 'change-list' },
      value.changes.map((change) => {
        const task = lookup.task(change.taskId);
        return h(
          'li',
          { class: 'change' },
          h('div', { class: 'change__task' }, courseTag(lookup.course(task.courseId)), h('span', { class: 'change__title' }, task.title)),
          h(
            'p',
            { class: 'change__move tabular' },
            change.from && h('span', { class: 'change__from' }, h('span', { class: 'sr-only' }, 'Antes: '), moment(change.from)),
            change.from && change.to && icon('arrowRight', { size: 18 }),
            change.to && h('span', { class: 'change__to' }, h('span', { class: 'sr-only' }, 'Después: '), moment(change.to)),
            change.type === 'remove' && h('span', { class: 'change__note' }, 'Ya no hace falta'),
          ),
        );
      }),
    ),
    relieved.length > 0 &&
      h(
        'ul',
        { class: 'impact-list', 'aria-label': 'Efecto en tu carga' },
        relieved.map((entry) =>
          h(
            'li',
            { class: 'impact' },
            h('span', { class: 'impact__day' }, capitalize(weekdayName(entry.day))),
            h('span', { class: 'impact__values tabular' }, `${formatHours(entry.before)} a ${formatHours(entry.after)}`),
            levelBadge(entry.levelAfter),
          ),
        ),
      ),
    value.unplaced.map((gap) =>
      h('p', { class: 'proposal__warning' }, icon('alert', { size: 18 }), `No alcanza para todo: faltan ${formatDuration(gap.minutes)} para «${lookup.task(gap.taskId).title}». Considera pedir una prórroga.`),
    ),
    h(
      'p',
      { class: 'proposal__guard' },
      icon('moon', { size: 18 }),
      value.extendedDays.length > 0
        ? `Nada después de las ${cutoff}. Excede tu límite de enfoque el ${joinList(value.extendedDays.map((day) => weekdayName(day)))}.`
        : `Nada después de las ${cutoff} y todo dentro de tus límites de enfoque.`,
    ),
    h(
      'div',
      { class: 'proposal__actions' },
      button({ label: 'Aplicar cambios', variant: 'primary', iconName: 'check', focusKey: 'apply-proposal', onClick: () => commands.applyProposal() }),
      button({ label: 'Descartar', variant: 'ghost', onClick: () => commands.dismissProposal() }),
    ),
  );
}

function radarCard(state, analysis, commands, selected, viewChanged) {
  const { data } = state;
  const scale = Math.max(240, ...analysis.days.map((day) => Math.max(day.demand, day.limit))) * 1.12;
  const animate = !prefersReducedMotion();

  const columns = analysis.days.map((day) => {
    const fill = day.demand / scale;
    const from = viewChanged ? 0 : (previousFill.get(day.day) ?? fill);
    previousFill.set(day.day, fill);
    const date = dateOfDay(data.weekStart, day.day).getDate();
    const deadlines = day.deadlines.length;
    // El nombre accesible empieza con el texto visible ("Hoy 14 1 h") para que el
    // control por voz funcione; el detalle se agrega solo para lectores de pantalla.
    const details = [
      ` de trabajo, ${formatDuration(day.capacity)} de enfoque disponible`,
      LEVELS[day.level].label,
      deadlines > 0 ? plural(deadlines, 'entrega') : null,
    ]
      .filter(Boolean)
      .join(', ');

    return h(
      'button',
      {
        type: 'button',
        class: ['radar__day', `is-${day.level}`, day.day === analysis.today && 'is-today', day.past && 'is-past'],
        'aria-pressed': String(selected === day.day),
        dataset: { focusKey: `radar-${day.day}` },
        onClick: () => commands.selectDay(day.day),
      },
      h(
        'span',
        { class: 'radar__label' },
        h('span', { class: 'radar__weekday' }, day.day === analysis.today ? 'Hoy' : capitalize(weekdayName(day.day, { short: true }))),
        ' ',
        h('span', { class: 'radar__date tabular' }, date),
      ),
      ' ',
      h('span', { class: 'radar__pins', 'aria-hidden': 'true' }, deadlines > 0 && [icon('flag', { size: 14 }), String(deadlines)]),
      h(
        'span',
        {
          class: ['radar__tube', animate && from !== fill && 'is-animated'],
          'aria-hidden': 'true',
          style: {
            '--fill': fill.toFixed(4),
            '--from': from.toFixed(4),
            '--limit': (day.limit / scale).toFixed(4),
            '--gap': day.demand > 0 ? (day.unplanned / day.demand).toFixed(4) : '0',
          },
        },
        h('span', { class: 'radar__fill' }, day.unplanned > 0 && h('span', { class: 'radar__gap' })),
        day.limit > 0 && h('span', { class: 'radar__limit' }),
      ),
      h('span', { class: 'radar__value tabular' }, formatHours(day.demand)),
      h('span', { class: 'sr-only' }, details),
    );
  });

  return h(
    'section',
    { class: 'card radar-card', 'data-tour': 'radar', 'aria-labelledby': 'radar-title' },
    sectionHeader({
      title: 'Carga por día',
      id: 'radar-title',
      action: h(
        'ul',
        { class: 'legend', 'aria-label': 'Cómo leer el radar' },
        h('li', {}, h('span', { class: 'legend__swatch legend__swatch--plan', 'aria-hidden': 'true' }), 'Trabajo planeado'),
        h('li', {}, h('span', { class: 'legend__swatch legend__swatch--gap', 'aria-hidden': 'true' }), 'Sin espacio'),
        h('li', {}, h('span', { class: 'legend__swatch legend__swatch--limit', 'aria-hidden': 'true' }), 'Tu límite de enfoque'),
      ),
    }),
    h('div', { class: 'radar', role: 'group', 'aria-label': 'Elige un día para ver su detalle' }, columns),
  );
}

function dayDetail(state, analysis, lookup, selected) {
  const { data } = state;
  const day = analysis.days[selected];
  const agenda = agendaForDay(data, selected);
  const study = agenda.items.filter((item) => item.kind === 'study');
  const commitments = agenda.items.filter((item) => item.kind !== 'study');

  return h(
    'section',
    { class: 'card day-detail', 'aria-labelledby': 'day-detail-title' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title', id: 'day-detail-title' }, capitalize(formatDay(data.weekStart, selected))),
      levelBadge(day.level),
    ),
    h(
      'dl',
      { class: 'day-detail__stats' },
      h('div', {}, h('dt', {}, 'Trabajo'), h('dd', { class: 'tabular' }, formatDuration(day.demand))),
      h('div', {}, h('dt', {}, 'Enfoque disponible'), h('dd', { class: 'tabular' }, formatDuration(day.capacity))),
      h('div', {}, h('dt', {}, 'Compromisos fijos'), h('dd', { class: 'tabular' }, commitments.length)),
    ),
    day.unplanned > 0 &&
      h('p', { class: 'day-detail__warning' }, icon('alert', { size: 18 }), `${formatDuration(day.unplanned)} de trabajo sin espacio en tu plan.`),
    h(
      'div',
      { class: 'day-detail__columns' },
      h(
        'div',
        {},
        h('h3', { class: 'day-detail__subtitle' }, 'Bloques de estudio'),
        study.length > 0
          ? h(
              'ul',
              { class: 'mini-list' },
              study.map((item) =>
                h(
                  'li',
                  { class: ['mini-list__item', item.block.done && 'is-done'] },
                  h('span', { class: 'mini-list__time tabular' }, formatRange(item.start, item.end)),
                  h('span', { class: 'mini-list__title' }, item.task.title),
                  courseTag(lookup.course(item.task.courseId)),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Sin bloques de estudio.'),
      ),
      h(
        'div',
        {},
        h('h3', { class: 'day-detail__subtitle' }, 'Entregas'),
        agenda.deadlines.length > 0
          ? h(
              'ul',
              { class: 'mini-list' },
              agenda.deadlines.map((task) =>
                h(
                  'li',
                  { class: 'mini-list__item' },
                  h('span', { class: 'mini-list__time tabular' }, formatClock(task.due)),
                  h('span', { class: 'mini-list__title' }, task.title),
                  courseTag(lookup.course(task.courseId)),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Nada vence este día.'),
      ),
    ),
  );
}

function sleepCard(data) {
  const { sleepLog, profile } = data;
  const goal = profile.sleep.goalMinutes;
  const average = Math.round(sleepLog.reduce((sum, minutes) => sum + minutes, 0) / sleepLog.length / 5) * 5;
  const maxMinutes = 540;

  return h(
    'section',
    { class: 'card sleep', 'aria-labelledby': 'sleep-title' },
    h(
      'div',
      { class: 'sleep__text' },
      h('h2', { class: 'section-title', id: 'sleep-title' }, 'Tu sueño también cuenta'),
      h(
        'p',
        {},
        `Promedio de las últimas ${sleepLog.length} noches: `,
        h('strong', { class: 'tabular' }, formatDuration(average)),
        `. Tu meta es ${formatDuration(goal)}.`,
      ),
      h('p', { class: 'muted' }, `Por eso MindOS no agenda estudio después de las ${formatClock(studyCutoff(profile))}, aunque haya prisa.`),
    ),
    h(
      'figure',
      { class: 'sleep__chart', style: { '--goal': (goal / maxMinutes).toFixed(4) } },
      h(
        'ul',
        { class: 'sleep__bars', 'aria-label': `Horas dormidas por noche: ${sleepLog.map((minutes) => formatDuration(minutes)).join(', ')}` },
        sleepLog.map((minutes, index) => {
          const night = index - sleepLog.length;
          return h(
            'li',
            { class: ['sleep__night', minutes < goal - 60 && 'is-short'] },
            h('span', { class: 'sleep__bar', style: { '--value': (minutes / maxMinutes).toFixed(4) } }),
            h('span', { class: 'sleep__label', 'aria-hidden': 'true' }, weekdayName(night, { short: true })),
          );
        }),
      ),
      h('span', { class: 'sleep__goal', 'aria-hidden': 'true' }),
    ),
  );
}

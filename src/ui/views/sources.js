// Fuentes: de dónde viene la información y cómo se mantiene al día.

import { DAYS_PER_WEEK, MINUTES_PER_DAY } from '../../domain/time.js';
import { dueChangeText } from '../../shared/copy.js';
import { capitalize, formatAgo, joinList, plural } from '../../shared/format.js';
import { button, createLookup, sectionHeader } from '../components.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { viewHeader } from './shared.js';

const EVENT_NOUNS = {
  class: ['clase', 'clases'],
  meeting: ['reunión', 'reuniones'],
  work: ['turno de trabajo', 'turnos de trabajo'],
};

export function renderSources(state, { commands }) {
  const { data, sync } = state;
  const lookup = createLookup(data);
  const syncing = new Set(sync.syncing);
  const busy = syncing.size > 0;
  const healthy = data.sources.filter((source) => source.status === 'ok');
  const lastSync = Math.max(...healthy.map((source) => source.lastSync));

  return h(
    'div',
    { class: 'view view--sources' },
    viewHeader({
      title: 'Fuentes',
      lede: 'MindOS lee tus plataformas con permisos de solo lectura. Nunca publica ni entrega nada por ti.',
    }),
    h(
      'div',
      { class: 'sources-toolbar' },
      button({
        label: busy ? 'Sincronizando…' : 'Sincronizar ahora',
        variant: 'primary',
        iconName: 'refresh',
        busy,
        disabled: busy,
        focusKey: 'sync-all',
        onClick: () => commands.syncAll(),
      }),
      h('p', { class: 'muted' }, busy ? `Revisando ${plural(syncing.size, 'plataforma')}…` : `Última sincronización: ${formatAgo(lastSync, data.now)}`),
    ),
    channelCard(),
    h(
      'section',
      { class: 'section section--spotlight', 'aria-labelledby': 'platforms-title', 'data-tour': 'sources' },
      sectionHeader({ title: 'Plataformas conectadas', id: 'platforms-title' }),
      h('ul', { class: 'sources-grid' }, data.sources.map((source) => sourceCard(source, { data, syncing, commands }))),
    ),
    h(
      'section',
      { class: 'section', 'aria-labelledby': 'activity-title' },
      sectionHeader({ title: 'Actividad reciente', id: 'activity-title' }),
      activityList(data, lookup),
    ),
    h('p', { class: 'sources-soon muted' }, icon('info', { size: 16 }), 'Próximamente: Moodle y SAES, para importar tu horario y tus calificaciones.'),
  );
}

function channelCard() {
  const setting = (iconName, label, value) =>
    h('li', { class: 'channel__setting' }, icon(iconName, { size: 18 }), h('span', {}, label), h('span', { class: 'channel__value' }, value));

  return h(
    'section',
    { class: 'card channel', 'aria-labelledby': 'channel-title' },
    h(
      'div',
      { class: 'channel__head' },
      h('span', { class: 'channel__mark', 'aria-hidden': 'true' }, icon('chat', { size: 22 })),
      h(
        'div',
        { class: 'channel__intro' },
        h('h2', { class: 'section-title', id: 'channel-title' }, 'WhatsApp'),
        h('p', { class: 'muted' }, 'Tu canal con MindOS: ahí recibes avisos y haces preguntas, sin instalar otra app.'),
      ),
      h('span', { class: 'level level--ok' }, icon('check'), 'Conectado'),
    ),
    h(
      'ul',
      { class: 'channel__settings' },
      setting('bell', 'Resumen diario', '06:45'),
      setting('alert', 'Aviso cuando un cambio afecta tu plan', 'Activado'),
      setting('focus', 'Recordatorio antes de cada bloque', '10 min antes'),
      setting('shield', 'Avisos fuera de una conversación', 'Plantillas aprobadas por Meta'),
    ),
  );
}

function contribution(source, data) {
  if (source.summary) return source.summary;
  const pending = data.tasks.filter((task) => task.sourceId === source.id && !task.done).length;
  const weekEnd = DAYS_PER_WEEK * MINUTES_PER_DAY;
  const events = data.events.filter((event) => event.sourceId === source.id && event.start >= 0 && event.start < weekEnd);
  const parts = [];
  if (pending > 0) parts.push(plural(pending, 'pendiente'));
  for (const [kind, [singular, pluralForm]] of Object.entries(EVENT_NOUNS)) {
    const count = events.filter((event) => event.kind === kind).length;
    if (count > 0) parts.push(plural(count, singular, pluralForm));
  }
  return parts.length > 0 ? `${capitalize(joinList(parts))} esta semana` : 'Sin elementos esta semana';
}

function sourceCard(source, { data, syncing, commands }) {
  const isSyncing = syncing.has(source.id);
  const status = isSyncing
    ? { tone: 'syncing', text: 'Sincronizando…', mark: h('span', { class: 'spinner', 'aria-hidden': 'true' }) }
    : source.status === 'error'
      ? { tone: 'error', text: source.error, mark: icon('alert', { size: 16 }) }
      : { tone: 'ok', text: `Al día, ${formatAgo(source.lastSync, data.now)}`, mark: icon('check', { size: 16 }) };

  return h(
    'li',
    { class: ['source-card', `is-${status.tone}`] },
    h(
      'div',
      { class: 'source-card__head' },
      h('span', { class: 'source-card__mark', 'aria-hidden': 'true' }, source.monogram),
      h('div', {}, h('h3', { class: 'source-card__name' }, source.name), h('p', { class: 'source-card__status' }, status.mark, status.text)),
    ),
    h('p', { class: 'source-card__contribution' }, contribution(source, data)),
    h('ul', { class: 'source-card__scopes', 'aria-label': 'Qué puede leer MindOS' }, source.scopes.map((scope) => h('li', { class: 'tag' }, scope))),
    source.status === 'error' &&
      button({
        label: isSyncing ? 'Conectando…' : 'Volver a autorizar',
        size: 'sm',
        iconName: 'lock',
        busy: isSyncing,
        disabled: isSyncing,
        focusKey: `reconnect-${source.id}`,
        onClick: () => commands.reconnectSource(source.id),
      }),
  );
}

function activityList(data, lookup) {
  const entries = [...data.activity].sort((a, b) => b.at - a.at).slice(0, 6);
  return h(
    'ol',
    { class: 'activity' },
    entries.map((entry) => {
      const source = lookup.source(entry.sourceId);
      const text = entry.change ? dueChangeText(entry.change, lookup.task(entry.change.taskId), data) : entry.text;
      return h(
        'li',
        { class: ['activity__item', entry.tone && `is-${entry.tone}`] },
        h('span', { class: 'activity__mark', 'aria-hidden': 'true' }, source.monogram),
        h(
          'div',
          { class: 'activity__body' },
          h('p', { class: 'activity__text' }, text),
          h('p', { class: 'activity__meta' }, `${source.name}, ${formatAgo(entry.at, data.now)}`),
        ),
        entry.tone === 'change' && h('span', { class: 'level level--tight' }, icon('clock'), 'Cambio de fecha'),
      );
    }),
  );
}

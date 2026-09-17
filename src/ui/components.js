// Piezas de interfaz compartidas por las vistas.

import { h } from './dom.js';
import { icon } from './icons.js';

export const LEVELS = {
  free: { label: 'Libre', icon: 'check' },
  ok: { label: 'Holgado', icon: 'check' },
  tight: { label: 'Justo', icon: 'clock' },
  over: { label: 'Sobrecarga', icon: 'alert' },
};

const SOURCE_SHORT_NAMES = {
  classroom: 'Classroom',
  teams: 'Teams',
  calendar: 'Calendar',
  asana: 'Asana',
  notion: 'Notion',
  drive: 'Drive',
  zoom: 'Zoom',
  meet: 'Meet',
};

export function createLookup(data) {
  const courses = new Map(data.courses.map((course) => [course.id, course]));
  const sources = new Map(data.sources.map((source) => [source.id, source]));
  const tasks = new Map(data.tasks.map((task) => [task.id, task]));
  return {
    course: (id) => courses.get(id),
    source: (id) => sources.get(id),
    task: (id) => tasks.get(id),
  };
}

export function courseTag(course) {
  if (!course) return null;
  return h('span', { class: ['tag', `course-${course.tone}`], title: course.name }, h('span', { class: 'tag__dot', 'aria-hidden': 'true' }), course.short);
}

export function sourceTag(source) {
  if (!source) return null;
  return h(
    'span',
    { class: 'tag', title: source.name },
    h('span', { class: 'tag__mark', 'aria-hidden': 'true' }, source.monogram),
    SOURCE_SHORT_NAMES[source.id] ?? source.name,
  );
}

export function levelBadge(level) {
  const info = LEVELS[level] ?? LEVELS.free;
  return h('span', { class: ['level', `level--${level}`] }, icon(info.icon), info.label);
}

export function emptyState({ iconName = 'check', title, body, action }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, { size: 24 })),
    h('p', { class: 'empty__title' }, title),
    body && h('p', { class: 'empty__body' }, body),
    action,
  );
}

export function button({ label, onClick, variant, size, iconName, disabled = false, busy = false, focusKey, attrs = {} }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['btn', variant && `btn--${variant}`, size && `btn--${size}`],
      onClick,
      disabled,
      'aria-busy': busy ? 'true' : null,
      dataset: focusKey ? { focusKey } : undefined,
      ...attrs,
    },
    busy ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : iconName && icon(iconName),
    label,
  );
}

export function sectionHeader({ title, id, action, level = 'h2' }) {
  return h('div', { class: 'section-head' }, h(level, { class: 'section-title', id }, title), action);
}

/** Avisos breves con acción opcional (por ejemplo, deshacer). */
export function createToaster(container, { duration = 5200, limit = 3 } = {}) {
  const TONE_ICONS = { success: 'check', info: 'info', error: 'alert' };

  const dismiss = (toast) => {
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };

  return function notify({ message, tone = 'info', action }) {
    const toast = h(
      'div',
      // El contenedor es una región aria-live permanente; los errores interrumpen.
      { class: ['toast', `toast--${tone}`], role: tone === 'error' ? 'alert' : null },
      h('span', { class: 'toast__icon' }, icon(TONE_ICONS[tone] ?? 'info')),
      h('span', { class: 'toast__message' }, message),
      action &&
        button({
          label: action.label,
          variant: 'ghost',
          size: 'sm',
          onClick: () => {
            action.run();
            dismiss(toast);
          },
        }),
    );
    container.append(toast);
    while (container.children.length > limit) container.firstElementChild.remove();
    let timer = setTimeout(() => dismiss(toast), duration);
    // Si la persona está leyendo o va a pulsar "Deshacer", el aviso espera.
    toast.addEventListener('pointerenter', () => clearTimeout(timer));
    toast.addEventListener('pointerleave', () => {
      timer = setTimeout(() => dismiss(toast), duration / 2);
    });
    toast.addEventListener('focusin', () => clearTimeout(timer));
  };
}

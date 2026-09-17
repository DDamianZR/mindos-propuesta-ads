// Estructura de la app: navegación, tema, vistas, chat y demo guiada.
// Renderiza una vez por cuadro y solo vuelve a construir la vista cuando
// cambian los datos de los que depende.

import { analyzeWeek } from '../domain/workload.js';
import { mountChat } from './chat.js';
import { icon } from './icons.js';
import { mountTour } from './tour.js';
import { renderSources } from './views/sources.js';
import { renderTasks } from './views/tasks.js';
import { renderToday } from './views/today.js';
import { renderWeek } from './views/week.js';

const VIEWS = {
  today: { title: 'Hoy', render: renderToday },
  week: { title: 'Semana', render: renderWeek },
  tasks: { title: 'Pendientes', render: renderTasks },
  sources: { title: 'Fuentes', render: renderSources },
};

const THEME_COLORS = { light: '#ece9f6', dark: '#1e1b2e' };

export function mountShell({ store, commands }) {
  const desktop = window.matchMedia('(min-width: 1180px)');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const viewRoot = document.getElementById('view');
  const topbar = document.querySelector('.topbar');
  const themeToggle = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  for (const slot of document.querySelectorAll('[data-icon]')) {
    slot.replaceWith(icon(slot.dataset.icon, { size: Number(slot.dataset.size) || 20 }));
  }

  const chat = mountChat(document.getElementById('assistant'), { commands });
  const tour = mountTour(document.getElementById('tour'), { store, commands, isDesktop: () => desktop.matches });

  let rendered = { view: null, deps: [] };
  let appliedDark = null;
  let frame = 0;
  let forceView = false;
  let focusHeading = false;

  const schedule = ({ force = false } = {}) => {
    forceView ||= force;
    if (!frame) frame = requestAnimationFrame(render);
  };

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-nav]');
    if (!target) return;
    focusHeading = true;
    commands.navigate(target.dataset.nav);
  });
  document.getElementById('tour-start').addEventListener('click', () => tour.start());
  document.getElementById('reset-demo').addEventListener('click', () => commands.resetDemo());
  themeToggle.addEventListener('click', () => commands.setTheme(isDark() ? 'light' : 'dark'));
  desktop.addEventListener('change', () => schedule({ force: true }));
  systemDark.addEventListener('change', () => schedule());
  window.addEventListener('scroll', () => topbar.toggleAttribute('data-scrolled', window.scrollY > 4), { passive: true });

  store.subscribe(() => schedule());
  render();

  function isDark() {
    return root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches;
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    const dark = isDark();
    if (dark === appliedDark) return;
    appliedDark = dark;
    themeToggle.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    themeToggle.replaceChildren(icon(dark ? 'sun' : 'moon'));
    themeMeta?.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
  }

  /** En escritorio el chat siempre está visible, así que "Asistente" equivale a "Hoy". */
  function visibleView(view) {
    if (view !== 'assistant') return view;
    return desktop.matches ? 'today' : 'assistant';
  }

  function updateNav(view, unread) {
    for (const item of document.querySelectorAll('[data-nav]')) {
      if (item.dataset.nav === view) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    for (const badge of document.querySelectorAll('[data-unread]')) {
      badge.textContent = String(unread);
      badge.hidden = unread === 0 || view === 'assistant';
    }
  }

  function renderView(state, view) {
    if (view === 'assistant') {
      rendered = { view, deps: [] };
      return;
    }
    const deps = [state.data, state.proposal, state.sync, state.ui.taskFilter, state.ui.selectedDay, state.prefs.welcomeDismissed];
    const viewChanged = rendered.view !== view;
    if (!viewChanged && !forceView && deps.every((dep, index) => dep === rendered.deps[index])) return;
    forceView = false;

    const active = document.activeElement;
    const hadFocus = viewRoot.contains(active);
    const focusKey = hadFocus ? active.dataset.focusKey : null;
    const node = VIEWS[view].render(state, {
      commands,
      analysis: analyzeWeek(state.data),
      viewChanged,
      startTour: () => tour.start(),
    });
    if (viewChanged) node.classList.add('is-entering');
    viewRoot.replaceChildren(node);
    rendered = { view, deps };

    if (viewChanged) {
      document.title = `${VIEWS[view].title} | MindOS`;
      if (focusHeading) {
        window.scrollTo({ top: 0 });
        viewRoot.querySelector('h1')?.focus({ preventScroll: true });
      }
    } else if (hadFocus) {
      // Si el control enfocado desapareció (por ejemplo, un botón que abre la
      // propuesta), el foco pasa al elemento que explica lo que ocurrió.
      const candidates = [
        focusKey && viewRoot.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`),
        viewRoot.querySelector('[data-focus-fallback]'),
        viewRoot.querySelector('h1'),
      ];
      // Un control puede existir pero no ser enfocable (por ejemplo, dentro de un <details> cerrado).
      for (const candidate of candidates) {
        candidate?.focus({ preventScroll: true });
        if (candidate && document.activeElement === candidate) break;
      }
    }
  }

  function render() {
    frame = 0;
    const state = store.getState();
    const view = visibleView(state.ui.view);
    applyTheme(state.prefs.theme);
    document.body.dataset.view = view;
    updateNav(view, state.chat.unread);
    renderView(state, view);
    if (view === 'assistant') document.title = 'Asistente | MindOS';
    focusHeading = false;
    chat.update(state);
    tour.update(state);
  }
}

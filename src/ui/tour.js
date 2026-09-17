// Demo guiada: la historia del producto en seis pasos, con guion para quien presenta.
// Cada paso lleva a la vista correcta y dispara lo necesario solo una vez,
// así que se puede avanzar y retroceder sin duplicar acciones.

import { analyzeWeek } from '../domain/workload.js';
import { button } from './components.js';
import { h, prefersReducedMotion } from './dom.js';
import { icon } from './icons.js';

const STEPS = [
  {
    view: 'sources',
    target: 'sources',
    title: 'Todo está disperso',
    body: 'Valeria usa ocho plataformas y cada profesor publica en una distinta. Ninguna ve su semana completa, así que nadie le avisa cuando algo choca.',
  },
  {
    view: 'tasks',
    target: 'tasks',
    title: 'Una sola lista',
    body: 'MindOS junta todos sus pendientes en una bandeja: ordenados por fecha, con el tiempo que falta y cuándo piensa trabajar en cada uno.',
  },
  {
    view: 'today',
    target: 'assistant',
    title: 'Su día, desde WhatsApp',
    body: 'No tiene que abrir otra app: pregunta por WhatsApp y MindOS le responde con su agenda y sus bloques de estudio entre clases.',
    run: ({ commands, flags }) => {
      if (flags.asked) return;
      flags.asked = true;
      commands.ask({ text: '¿Qué tengo hoy?' });
    },
  },
  {
    view: 'week',
    target: 'radar',
    title: 'Algo cambia',
    body: 'La profesora adelanta el quiz en Teams. MindOS cruza ese cambio con las otras entregas y el turno de trabajo de Valeria: el miércoles ya no le alcanza.',
    run: async ({ store, commands, flags, reframe }) => {
      if (!flags.sync && store.getState().data.remoteChanges.length > 0) flags.sync = commands.syncAll();
      await flags.sync;
      reframe();
    },
  },
  {
    view: 'week',
    target: 'proposal',
    title: 'MindOS propone, Valeria decide',
    body: 'Busca el cambio que menos altera su semana, sin tocar sus horas de sueño. Ella puede aplicarlo aquí o respondiendo en WhatsApp.',
    run: async ({ store, commands, flags, reframe }) => {
      await flags.sync;
      await commands.idle();
      const state = store.getState();
      if (!flags.proposal && state.proposal.status === 'idle' && analyzeWeek(state.data).issues.length > 0) {
        flags.proposal = commands.requestProposal();
      }
      await flags.proposal;
      reframe();
    },
  },
  {
    view: 'week',
    target: 'radar',
    title: 'Semana viable otra vez',
    body: 'El plan se actualiza en la app y en WhatsApp al mismo tiempo. Lo que sigue: horario desde SAES, modo equipo para proyectos y alertas tempranas para tutores.',
    run: async ({ store, commands, flags, reframe }) => {
      await flags.sync;
      await flags.proposal;
      if (store.getState().proposal.status === 'ready') commands.applyProposal();
      reframe();
    },
  },
];

export function mountTour(container, { store, commands, isDesktop }) {
  let flags = {};
  let renderedStep = null;
  let scrollPending = false;
  let spotlit = null;

  const goTo = (index) => commands.setTourStep(index);
  const close = () => commands.setTourStep(null);

  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  function renderPanel(index) {
    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;
    container.replaceChildren(
      h(
        'div',
        { class: 'tour__progress', 'aria-hidden': 'true' },
        STEPS.map((_, position) => h('span', { class: ['tour__dot', position < index && 'is-done', position === index && 'is-current'] })),
      ),
      h(
        'div',
        { class: 'tour__head' },
        h('p', { class: 'tour__count' }, `Demo guiada, paso ${index + 1} de ${STEPS.length}`),
        h('button', { type: 'button', class: 'btn btn--icon btn--sm btn--ghost', 'aria-label': 'Salir de la demo guiada', onClick: close }, icon('close', { size: 18 })),
      ),
      h('h2', { class: 'tour__title', id: 'tour-title', tabindex: '-1' }, step.title),
      h('p', { class: 'tour__body' }, step.body),
      h(
        'div',
        { class: 'tour__actions' },
        button({ label: 'Anterior', variant: 'ghost', size: 'sm', iconName: 'chevronLeft', disabled: index === 0, onClick: () => goTo(index - 1) }),
        isLast
          ? button({ label: 'Terminar', variant: 'primary', size: 'sm', iconName: 'check', onClick: close })
          : button({ label: 'Siguiente', variant: 'primary', size: 'sm', onClick: () => goTo(index + 1) }),
      ),
    );
    container.querySelector('.tour__title').focus({ preventScroll: true });
  }

  function enter(index) {
    const step = STEPS[index];
    // En pantallas pequeñas el chat es una sección aparte.
    const view = step.target === 'assistant' && !isDesktop() ? 'assistant' : step.view;
    commands.navigate(view);
    scrollPending = true;
    // Las acciones asíncronas cambian el layout: al terminar, se vuelve a encuadrar el objetivo.
    const reframe = () => {
      if (renderedStep === index) scrollPending = true;
    };
    Promise.resolve(step.run?.({ store, commands, flags, reframe })).catch((error) => console.error('MindOS: error en la demo guiada', error));
  }

  function spotlight(target) {
    const element = [...document.querySelectorAll(`[data-tour="${target}"]`)].find((node) => node.getClientRects().length > 0);
    if (spotlit && spotlit !== element) spotlit.classList.remove('is-spotlit');
    spotlit = element ?? null;
    if (!element) return;
    element.classList.add('is-spotlit');
    if (!scrollPending) return;
    scrollPending = false;
    // Deja el elemento debajo de la barra superior y del panel de la demo cuando este va arriba.
    const topbar = document.querySelector('.topbar')?.offsetHeight ?? 0;
    const panelOnTop = getComputedStyle(container).position === 'sticky';
    const offset = topbar + (panelOnTop ? container.offsetHeight + 32 : 24);
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  return {
    start() {
      flags = {};
      renderedStep = null;
      commands.dismissWelcome();
      commands.resetDemo();
      goTo(0);
    },

    update(state) {
      const index = state.ui.tourStep;
      const active = index !== null && index !== undefined;
      container.hidden = !active;
      document.body.toggleAttribute('data-touring', active);
      if (!active) {
        spotlit?.classList.remove('is-spotlit');
        spotlit = null;
        renderedStep = null;
        return;
      }
      if (index !== renderedStep) {
        renderedStep = index;
        renderPanel(index);
        enter(index);
      }
      spotlight(STEPS[index].target);
    },
  };
}

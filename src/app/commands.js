// Casos de uso de la app. Coordinan store, asistente y dominio, y agregan los
// tiempos que hacen legible cada acción (escribir, sincronizar, analizar).
// La interfaz solo llama a estos comandos; nunca despacha acciones directamente.

import { createProposal } from '../domain/planner.js';
import { actions, createInitialState } from './reducer.js';

export const DEFAULT_TIMING = { read: 300, typing: 850, sync: 1300, analyze: 750 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} deps
 * @param {ReturnType<import('./store.js').createStore>} deps.store
 * @param {{ respond: Function, briefing: Function, syncReport: Function, appliedNotice: Function }} deps.assistant
 * @param {(toast: { message: string, tone?: string, action?: { label: string, run: Function } }) => void} [deps.notify]
 * @param {(ms: number) => Promise<void>} [deps.delay]
 */
export function createCommands({ store, assistant, notify = () => {}, delay = sleep, timing = DEFAULT_TIMING, today = () => new Date() }) {
  const get = () => store.getState();
  const { dispatch } = store;

  // Cada reinicio de la demo abre una generación nueva. El trabajo asíncrono de
  // una generación anterior (respuestas, sincronizaciones) se descarta al despertar.
  let generation = 0;
  const currentGeneration = () => {
    const born = generation;
    return () => born === generation;
  };

  // Las respuestas del asistente se entregan en orden, una conversación a la vez.
  let conversation = Promise.resolve();
  const enqueue = (task) => {
    const alive = currentGeneration();
    conversation = conversation
      .then(() => (alive() ? task(alive) : undefined))
      .catch((error) => {
        dispatch(actions.typingChanged(false));
        console.error('MindOS: error en la conversación', error);
      });
    return conversation;
  };

  const deliver = async (message, alive) => {
    dispatch(actions.typingChanged(true));
    await delay(timing.typing);
    if (!alive()) return;
    dispatch(actions.typingChanged(false));
    dispatch(actions.messageAdded(message));
  };

  async function sync(origin, alive = currentGeneration()) {
    const state = get();
    if (state.sync.syncing.length > 0) return [];
    const ids = state.data.sources.filter((source) => source.status !== 'error').map((source) => source.id);
    const incoming = state.data.remoteChanges.filter((change) => ids.includes(change.sourceId));
    dispatch(actions.syncStarted(ids));
    await delay(timing.sync);
    if (!alive()) return [];
    dispatch(actions.syncFinished(ids));

    if (origin === 'chat') {
      await deliver(assistant.syncReport(get(), incoming), alive);
      return incoming;
    }
    notify(
      incoming.length > 0
        ? { message: incoming.length === 1 ? 'Se detectó 1 cambio' : `Se detectaron ${incoming.length} cambios`, tone: 'info' }
        : { message: 'Todo está al día', tone: 'success' },
    );
    // Los cambios importantes se avisan por WhatsApp: es donde está el estudiante.
    if (incoming.length > 0) enqueue((stillAlive) => deliver(assistant.syncReport(get(), incoming), stillAlive));
    return incoming;
  }

  return {
    /** Mensaje escrito o botón de respuesta rápida. */
    ask(input) {
      const text = (input.text ?? input.label ?? '').trim();
      if (!text) return conversation;
      dispatch(actions.clockAdvanced(1));
      dispatch(actions.messageAdded({ from: 'user', text }));
      return enqueue(async (alive) => {
        await delay(timing.read);
        if (!alive()) return;
        dispatch(actions.typingChanged(true));
        await delay(timing.typing);
        if (!alive()) return;
        const result = assistant.respond(get(), { text, intent: input.intent, params: input.params });
        for (const action of result.actions) dispatch(action);
        dispatch(actions.typingChanged(false));
        const [first, ...rest] = result.replies;
        if (first) dispatch(actions.messageAdded(first));
        for (const message of rest) await deliver(message, alive);
        for (const effect of result.effects) {
          if (!alive()) return;
          if (effect.type === 'navigate') dispatch(actions.navigate(effect.view));
          if (effect.type === 'sync') await sync('chat', alive);
        }
      });
    },

    /** Resumen de la mañana, si la conversación está vacía. */
    start() {
      if (get().chat.messages.length > 0) return conversation;
      return enqueue((alive) => deliver(assistant.briefing(get()), alive));
    },

    navigate(view) {
      dispatch(actions.navigate(view));
    },

    filterTasks(filter) {
      dispatch(actions.taskFilterChanged(filter));
    },

    selectDay(day) {
      dispatch(actions.daySelected(get().ui.selectedDay === day ? null : day));
    },

    setTheme(theme) {
      dispatch(actions.themeChanged(theme));
    },

    dismissWelcome() {
      dispatch(actions.welcomeDismissed());
    },

    setTourStep(step) {
      dispatch(actions.tourStepChanged(step));
    },

    setTaskDone(taskId, done) {
      const { data } = get();
      const task = data.tasks.find((item) => item.id === taskId);
      if (!task || task.done === done) return;
      const previous = { tasks: data.tasks, blocks: data.blocks };
      dispatch(actions.taskDone(taskId, done));
      notify({
        message: done ? `Terminaste «${task.short}»` : `«${task.short}» volvió a pendientes`,
        tone: done ? 'success' : 'info',
        action: { label: 'Deshacer', run: () => dispatch(actions.dataPatched(previous)) },
      });
    },

    setBlockDone(blockId, done) {
      const { data } = get();
      const block = data.blocks.find((item) => item.id === blockId);
      if (!block || block.done === done) return;
      const previous = { blocks: data.blocks };
      dispatch(actions.blockDone(blockId, done));
      notify({
        message: done ? 'Bloque de estudio completado' : 'Bloque marcado como pendiente',
        tone: done ? 'success' : 'info',
        action: { label: 'Deshacer', run: () => dispatch(actions.dataPatched(previous)) },
      });
    },

    syncAll() {
      return sync('app');
    },

    async reconnectSource(sourceId) {
      const alive = currentGeneration();
      const source = get().data.sources.find((item) => item.id === sourceId);
      if (!source || get().sync.syncing.includes(sourceId)) return;
      dispatch(actions.syncStarted([sourceId]));
      await delay(timing.sync);
      if (!alive()) return;
      dispatch(actions.sourceReconnected(sourceId));
      notify({ message: `${source.name} vuelve a sincronizar`, tone: 'success' });
    },

    async requestProposal() {
      const alive = currentGeneration();
      if (get().proposal.status === 'loading') return;
      dispatch(actions.proposalRequested('app'));
      await delay(timing.analyze);
      if (!alive() || get().proposal.status !== 'loading') return;
      dispatch(actions.proposalReady(createProposal(get().data)));
    },

    applyProposal() {
      const state = get();
      const proposal = state.proposal.value;
      if (!proposal) return;
      const previous = { blocks: state.data.blocks };
      dispatch(actions.proposalApplied());
      notify({
        message: 'Cambios aplicados a tu plan',
        tone: 'success',
        action: { label: 'Deshacer', run: () => dispatch(actions.dataPatched(previous)) },
      });
      enqueue((alive) => deliver(assistant.appliedNotice(get(), proposal), alive));
    },

    dismissProposal() {
      dispatch(actions.proposalDismissed());
    },

    /** Vuelve al lunes por la mañana, conservando preferencias. */
    resetDemo() {
      const previous = get();
      generation += 1;
      const fresh = createInitialState({ today: today(), prefs: { ...previous.prefs, welcomeDismissed: true } });
      dispatch(actions.demoReset({ ...fresh, ui: { ...fresh.ui, tourStep: previous.ui.tourStep } }));
      return enqueue((alive) => deliver(assistant.briefing(get()), alive));
    },

    /** Espera a que termine la conversación en curso. */
    idle() {
      return conversation;
    },
  };
}

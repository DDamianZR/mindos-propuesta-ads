// Estado de la aplicación y sus transiciones. Todo es inmutable y puro.
//
//   data      Datos del estudiante (lo que sincroniza MindOS y el plan).
//   chat      Conversación del canal de WhatsApp.
//   sync      Fuentes que se están sincronizando.
//   proposal  Propuesta de reorganización en curso.
//   ui        Navegación y filtros de la app web.
//   prefs     Preferencias que sobreviven a reiniciar la demo.

import { createDemoData } from '../data/seed.js';

export const VIEWS = ['today', 'week', 'tasks', 'sources', 'assistant'];

const MAX_MESSAGES = 80;
const IDLE_PROPOSAL = { status: 'idle', value: null, origin: null };

export function createInitialState({ today = new Date(), prefs = {} } = {}) {
  return {
    data: createDemoData(today),
    chat: { messages: [], seq: 0, typing: false, pending: null, unread: 0 },
    sync: { syncing: [] },
    proposal: IDLE_PROPOSAL,
    ui: { view: 'today', taskFilter: 'all', selectedDay: null, tourStep: null },
    prefs: { theme: 'system', welcomeDismissed: false, ...prefs },
  };
}

export const actions = {
  navigate: (view) => ({ type: 'ui/navigate', view }),
  taskFilterChanged: (filter) => ({ type: 'ui/taskFilterChanged', filter }),
  daySelected: (day) => ({ type: 'ui/daySelected', day }),
  tourStepChanged: (step) => ({ type: 'ui/tourStepChanged', step }),
  themeChanged: (theme) => ({ type: 'prefs/themeChanged', theme }),
  welcomeDismissed: () => ({ type: 'prefs/welcomeDismissed' }),
  clockAdvanced: (minutes) => ({ type: 'data/clockAdvanced', minutes }),
  taskDone: (taskId, done) => ({ type: 'data/taskDone', taskId, done }),
  blockDone: (blockId, done) => ({ type: 'data/blockDone', blockId, done }),
  dataPatched: (patch) => ({ type: 'data/patched', patch }),
  syncStarted: (sourceIds) => ({ type: 'sync/started', sourceIds }),
  syncFinished: (sourceIds) => ({ type: 'sync/finished', sourceIds }),
  sourceReconnected: (sourceId) => ({ type: 'sync/sourceReconnected', sourceId }),
  proposalRequested: (origin) => ({ type: 'proposal/requested', origin }),
  proposalReady: (proposal) => ({ type: 'proposal/ready', proposal }),
  proposalApplied: () => ({ type: 'proposal/applied' }),
  proposalDismissed: () => ({ type: 'proposal/dismissed' }),
  messageAdded: (message) => ({ type: 'chat/messageAdded', message }),
  typingChanged: (typing) => ({ type: 'chat/typingChanged', typing }),
  demoReset: (state) => ({ type: 'demo/reset', state }),
};

/** Cambia datos y descarta la propuesta, que dejaría de corresponder al plan. */
function changeData(state, patch) {
  return { ...state, data: { ...state.data, ...patch }, proposal: IDLE_PROPOSAL };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'ui/navigate': {
      if (!VIEWS.includes(action.view) || state.ui.view === action.view) return state;
      const chat = action.view === 'assistant' ? { ...state.chat, unread: 0 } : state.chat;
      return { ...state, chat, ui: { ...state.ui, view: action.view } };
    }

    case 'ui/taskFilterChanged':
      return { ...state, ui: { ...state.ui, taskFilter: action.filter } };

    case 'ui/daySelected':
      return { ...state, ui: { ...state.ui, selectedDay: action.day } };

    case 'ui/tourStepChanged':
      return { ...state, ui: { ...state.ui, tourStep: action.step } };

    case 'prefs/themeChanged':
      return { ...state, prefs: { ...state.prefs, theme: action.theme } };

    case 'prefs/welcomeDismissed':
      return state.prefs.welcomeDismissed ? state : { ...state, prefs: { ...state.prefs, welcomeDismissed: true } };

    case 'data/clockAdvanced':
      // El reloj avanza con la conversación, pero no invalida una propuesta abierta.
      return { ...state, data: { ...state.data, now: state.data.now + action.minutes } };

    case 'data/taskDone': {
      const { data } = state;
      const task = data.tasks.find((item) => item.id === action.taskId);
      if (!task || task.done === action.done) return state;
      const tasks = data.tasks.map((item) =>
        item.id === action.taskId ? { ...item, done: action.done, completedAt: action.done ? data.now : null } : item,
      );
      // Una tarea terminada ya no necesita sus bloques futuros.
      const blocks = action.done
        ? data.blocks.filter((block) => block.taskId !== action.taskId || block.done || block.start < data.now)
        : data.blocks;
      return changeData(state, { tasks, blocks });
    }

    case 'data/blockDone': {
      const block = state.data.blocks.find((item) => item.id === action.blockId);
      if (!block || block.done === action.done) return state;
      const blocks = state.data.blocks.map((item) => (item.id === action.blockId ? { ...item, done: action.done } : item));
      return changeData(state, { blocks });
    }

    case 'data/patched':
      return changeData(state, action.patch);

    case 'sync/started': {
      const syncing = [...new Set([...state.sync.syncing, ...action.sourceIds])];
      return { ...state, sync: { syncing } };
    }

    case 'sync/finished': {
      const { data } = state;
      const ids = new Set(action.sourceIds);
      const applied = data.remoteChanges.filter((change) => ids.has(change.sourceId));
      const tasks = data.tasks.map((task) => {
        const change = applied.find((item) => item.taskId === task.id);
        return change ? { ...task, [change.field]: change.to } : task;
      });
      const next = {
        ...state,
        sync: { syncing: state.sync.syncing.filter((id) => !ids.has(id)) },
        data: {
          ...data,
          tasks,
          remoteChanges: data.remoteChanges.filter((change) => !ids.has(change.sourceId)),
          sources: data.sources.map((source) =>
            ids.has(source.id) && source.status !== 'error' ? { ...source, lastSync: data.now } : source,
          ),
          activity: [
            ...data.activity,
            ...applied.map((change) => ({ id: `act-${change.id}`, at: data.now, sourceId: change.sourceId, tone: 'change', change })),
          ],
        },
      };
      return applied.length > 0 ? { ...next, proposal: IDLE_PROPOSAL } : next;
    }

    case 'sync/sourceReconnected': {
      const { data } = state;
      return {
        ...state,
        sync: { syncing: state.sync.syncing.filter((id) => id !== action.sourceId) },
        data: {
          ...data,
          sources: data.sources.map((source) =>
            source.id === action.sourceId ? { ...source, status: 'ok', error: null, lastSync: data.now } : source,
          ),
          activity: [
            ...data.activity,
            { id: `act-reconnect-${action.sourceId}-${data.now}`, at: data.now, sourceId: action.sourceId, tone: 'ok', text: 'Volviste a autorizar el acceso. La sincronización está al día.' },
          ],
        },
      };
    }

    case 'proposal/requested':
      return { ...state, proposal: { status: 'loading', value: null, origin: action.origin } };

    case 'proposal/ready':
      return { ...state, proposal: { status: 'ready', value: action.proposal, origin: state.proposal.origin ?? 'chat' } };

    case 'proposal/applied':
      if (!state.proposal.value) return state;
      return { ...state, data: { ...state.data, blocks: state.proposal.value.blocks }, proposal: IDLE_PROPOSAL };

    case 'proposal/dismissed':
      return state.proposal.status === 'idle' ? state : { ...state, proposal: IDLE_PROPOSAL };

    case 'chat/messageAdded': {
      const seq = state.chat.seq + 1;
      const message = { ...action.message, id: `m${seq}`, at: action.message.at ?? state.data.now };
      const fromMindos = message.from === 'mindos';
      return {
        ...state,
        chat: {
          ...state.chat,
          seq,
          messages: [...state.chat.messages, message].slice(-MAX_MESSAGES),
          // Una pregunta abierta solo vale hasta el siguiente mensaje de MindOS.
          pending: fromMindos ? (message.pending ?? null) : state.chat.pending,
          unread: fromMindos && state.ui.view !== 'assistant' ? state.chat.unread + 1 : state.chat.unread,
        },
      };
    }

    case 'chat/typingChanged':
      return state.chat.typing === action.typing ? state : { ...state, chat: { ...state.chat, typing: action.typing } };

    case 'demo/reset':
      return action.state;

    default:
      return state;
  }
}

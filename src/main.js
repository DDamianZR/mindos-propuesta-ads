// Punto de composición: aquí se eligen las implementaciones concretas.
// Para cambiar el motor de reglas por un LLM, o localStorage por una API,
// basta con inyectar otra implementación con la misma interfaz.

import { DEFAULT_TIMING, createCommands } from './app/commands.js';
import { createPersistence } from './app/persistence.js';
import { createInitialState, reducer } from './app/reducer.js';
import { createStore } from './app/store.js';
import { ruleBasedAssistant } from './assistant/engine.js';
import { createToaster } from './ui/components.js';
import { prefersReducedMotion } from './ui/dom.js';
import { mountShell } from './ui/shell.js';

const persistence = createPersistence();
const fresh = createInitialState();
const saved = persistence.load(fresh.data.weekStart);

const store = createStore(reducer, {
  ...fresh,
  prefs: { ...fresh.prefs, ...saved.prefs },
  ...(saved.session && { data: saved.session.data, chat: { ...fresh.chat, ...saved.session.chat } }),
});

const commands = createCommands({
  store,
  assistant: ruleBasedAssistant,
  notify: createToaster(document.getElementById('toasts')),
  timing: prefersReducedMotion() ? { read: 0, typing: 250, sync: 500, analyze: 250 } : DEFAULT_TIMING,
});

let saveTimer = 0;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistence.save(store.getState()), 250);
});

mountShell({ store, commands });
commands.start();

// Se revela cuando la fuente está lista, con un tope para no dejar la pantalla en blanco
// si la red es lenta o no hay conexión.
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 700))]).then(() => {
  delete document.documentElement.dataset.loading;
});

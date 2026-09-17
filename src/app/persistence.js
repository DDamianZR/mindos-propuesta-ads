// Persistencia local de la demo. Si el almacenamiento no está disponible
// (modo privado, bloqueado, lleno), la app sigue funcionando en memoria.

import { SCHEMA_VERSION } from '../data/seed.js';

export const STORAGE_KEY = 'mindos:demo';

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createPersistence(storage = browserStorage()) {
  const read = () => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  return {
    /**
     * Las preferencias siempre se recuperan. La sesión solo si es de la misma
     * semana y del mismo esquema: con fechas relativas, otra semana no aplica.
     */
    load(weekStart) {
      const snapshot = read();
      const prefs = snapshot?.prefs ?? null;
      const valid = snapshot?.version === SCHEMA_VERSION && snapshot.session?.data?.weekStart === weekStart;
      return { prefs, session: valid ? snapshot.session : null };
    },

    save(state) {
      try {
        storage?.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: SCHEMA_VERSION,
            prefs: state.prefs,
            session: {
              data: state.data,
              chat: { messages: state.chat.messages, seq: state.chat.seq, pending: state.chat.pending },
            },
          }),
        );
      } catch {
        // Sin espacio o sin permiso: la demo sigue en memoria.
      }
    },
  };
}

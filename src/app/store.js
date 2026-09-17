// Store mínimo: un estado inmutable, un reducer puro y suscriptores.

export function createStore(reducer, initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,

    dispatch(action) {
      const previous = state;
      const next = reducer(state, action);
      if (next === previous) return;
      state = next;
      for (const listener of listeners) listener(state, previous, action);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

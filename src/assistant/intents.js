// Comprensión de mensajes en español para el motor basado en reglas.
// Tolera acentos, mayúsculas, signos y variaciones comunes del habla en México.

export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cada intención suma el peso de los patrones que coinciden. Gana el mayor
 * puntaje; en empate, la que aparece antes en la lista.
 * `needsPending` limita la intención a cuando hay una pregunta abierta.
 */
const INTENTS = [
  { id: 'confirm', needsPending: true, patterns: [[/^(si|sip|simon|dale|va|ok|okay|claro|de acuerdo|aplica|aplicalo|hazlo|aplicar cambios)\b/, 3]] },
  { id: 'decline', needsPending: true, patterns: [[/^(no|nel|ahora no|luego|despues|mejor no|cancela)\b/, 3]] },
  {
    id: 'rebalance',
    patterns: [
      [/reorganiz|reprogram|redistribu|reacomod|replanific/, 3],
      [/no me (da|alcanza) (el )?tiempo|no alcanzo|no me alcanza/, 3],
    ],
  },
  { id: 'complete', patterns: [[/\b(termine|acabe|complete|entregue|hice|termine de)\b/, 3], [/\b(listo|hecho|terminado|terminada)\b/, 2]] },
  { id: 'changes', patterns: [[/\bcambio|novedad|actualiza|sincroniza|algo nuevo|hay de nuevo/, 2]] },
  { id: 'meetings', patterns: [[/reunion|junta|llamada|asesoria|videollamada/, 2], [/\bzoom\b|\bmeet\b/, 1]] },
  { id: 'next', patterns: [[/que sigue|ahora que|que hago ahora|lo siguiente|siguiente/, 3]] },
  { id: 'tomorrow', patterns: [[/\bmanana\b/, 2]] },
  { id: 'plan', patterns: [[/\bplan\b|planifica|que estudio|estudiar|bloques? de estudio/, 2], [/\borganiza/, 1]] },
  { id: 'deadlines', patterns: [[/entrega|pendiente|tarea|deberes|para cuando|vence/, 2]] },
  { id: 'week', patterns: [[/me da tiempo|carga|saturad|agobiad|estresad|como va mi semana|como viene/, 3], [/semana/, 1]] },
  { id: 'today', patterns: [[/\bhoy\b|mi dia|agenda|que tengo|que me toca|horario/, 1]] },
  { id: 'sleep', patterns: [[/dormi|sueno|desvel|cansad|descans/, 2]] },
  { id: 'help', patterns: [[/ayuda|que puedes|que sabes|como funcionas|opciones|menu/, 2]] },
  { id: 'thanks', patterns: [[/gracias|grax|genial|perfecto|excelente|chido/, 1]] },
  { id: 'greeting', patterns: [[/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que onda|que tal)\b/, 1]] },
];

/** @returns {{ intent: string, score: number }} */
export function detectIntent(text, { pending = null } = {}) {
  const normalized = normalize(text);
  let best = { intent: 'unknown', score: 0 };
  for (const definition of INTENTS) {
    if (definition.needsPending && !pending) continue;
    const score = definition.patterns.reduce((sum, [pattern, weight]) => sum + (pattern.test(normalized) ? weight : 0), 0);
    if (score > best.score) best = { intent: definition.id, score };
  }
  return best;
}

const STOPWORDS = new Set(['para', 'como', 'hasta', 'entre', 'sobre', 'desde', 'avance', 'proyecto', 'entrega', 'practica']);

/** Tareas que el mensaje menciona, de la más a la menos probable. */
export function matchTasks(text, tasks) {
  const normalized = ` ${normalize(text)} `;
  return tasks
    .map((task) => {
      const titleWords = normalize(task.title)
        .split(' ')
        .filter((word) => word.length >= 6 && !STOPWORDS.has(word));
      const terms = [...new Set([...(task.keywords ?? []).map(normalize), ...titleWords])];
      const score = terms.reduce((sum, term) => {
        if (!normalized.includes(` ${term} `) && !normalized.includes(` ${term}s `)) return sum;
        return sum + (term.includes(' ') ? 2 : 1);
      }, 0);
      return { task, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.task.due - b.task.due);
}

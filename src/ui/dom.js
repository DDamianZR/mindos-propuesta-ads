// Creación declarativa y segura de elementos. El texto siempre se inserta como
// nodo de texto: ningún dato de usuario pasa por innerHTML.

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') {
      element.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'style') {
      for (const [property, propertyValue] of Object.entries(value)) element.style.setProperty(property, propertyValue);
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  appendChildren(element, children);
  return element;
}

function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/**
 * Convierte el formato de WhatsApp (*negritas* y _cursivas_) en nodos.
 * Los saltos de línea se conservan con CSS (white-space: pre-wrap).
 */
export function richText(text) {
  const nodes = [];
  const pattern = /\*([^*\n]+)\*|_([^_\n]+)_/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) nodes.push(document.createTextNode(text.slice(cursor, match.index)));
    nodes.push(match[1] !== undefined ? h('strong', {}, match[1]) : h('em', {}, match[2]));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(document.createTextNode(text.slice(cursor)));
  return nodes;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

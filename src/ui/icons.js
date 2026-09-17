// Iconografía de trazo: rejilla de 24 px, trazo de 1.8 px, extremos redondeados.
// Las rutas son constantes del código; nunca contienen datos del usuario.

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  today:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  week: '<path d="M5 20v-7M10 20V6M15 20v-9M20 20V9"/>',
  tasks: '<path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="m3.5 6.5 1.6 1.6L8 5.2M3.5 12l1.6 1.6L8 10.7M3.5 17.5l1.6 1.6L8 16.2"/>',
  sources:
    '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6"/>',
  chat: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.7Z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checks: '<path d="m2.5 12.5 4 4L15 8"/><path d="m11.5 16 .5.5L20.5 8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  alert: '<path d="M10.3 4 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.2M12 17.2h.01"/>',
  sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="m18.5 15.5.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8Z"/>',
  refresh:
    '<path d="M20 11A8 8 0 0 0 6 6.3L4 8.5"/><path d="M4 3.5v5h5"/><path d="M4 13a8 8 0 0 0 14 4.7l2-2.2"/><path d="M20 20.5v-5h-5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14.5H6.5A2.5 2.5 0 0 0 4 20Z"/><path d="M4 20a2.5 2.5 0 0 1 2.5-2.5H20V21H6.5A2.5 2.5 0 0 1 4 20Z"/>',
  video: '<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="m15.5 10.5 5.5-3v9l-5.5-3Z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  flag: '<path d="M5.5 21V4M5.5 4H17l-2.2 4.2L17 12.5H5.5"/>',
  focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
  arrowRight: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M4 12 20.5 4 14 20.5l-2.6-6.9Z"/><path d="M11.4 13.6 20.5 4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2a6.5 6.5 0 0 1 3 6.3"/>',
  pin: '<path d="M12 21.5s7-6.1 7-11.8a7 7 0 0 0-14 0c0 5.7 7 11.8 7 11.8Z"/><circle cx="12" cy="9.7" r="2.6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  bell: '<path d="M18 15.5V11a6 6 0 0 0-12 0v4.5L4 18h16Z"/><path d="M10 21h4"/>',
  restart: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  shield: '<path d="M12 21.5s7.5-3.2 7.5-9.5V5.5L12 2.5 4.5 5.5V12c0 6.3 7.5 9.5 7.5 9.5Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
};

/**
 * @param {keyof PATHS} name
 * @param {{ size?: number, label?: string, className?: string }} [options]
 */
export function icon(name, { size = 20, label, className = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${className}`.trim());
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  svg.innerHTML = PATHS[name] ?? PATHS.info;
  return svg;
}

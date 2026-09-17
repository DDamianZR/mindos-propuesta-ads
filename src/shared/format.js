// Formato en español de México, compartido por la app web y el canal de WhatsApp.
// Se usan tablas propias en lugar de Intl para que el texto sea idéntico en
// todos los navegadores y en las pruebas.

import { dateOfDay, dayOf, minuteOfDay, weekdayOf } from '../domain/time.js';

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const WEEKDAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatClock(minute) {
  const value = minuteOfDay(minute);
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatRange(start, end) {
  return `${formatClock(start)}–${formatClock(end)}`;
}

/** 90 → "1 h 30 min", 45 → "45 min", 120 → "2 h". */
export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** 90 → "1.5 h", compacto para gráficas. */
export function formatHours(minutes) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

export function weekdayName(day, { short = false } = {}) {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[weekdayOf(day)];
}

/** "lunes 14 de septiembre" o, en corto, "lun 14". */
export function formatDay(weekStart, day, { short = false } = {}) {
  const date = dateOfDay(weekStart, day);
  if (short) return `${weekdayName(day, { short: true })} ${date.getDate()}`;
  return `${weekdayName(day)} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** Día relativo al reloj: "hoy", "mañana", "el jueves", "el lunes 21". */
export function relativeDay(weekStart, day, now) {
  const today = dayOf(now);
  if (day === today) return 'hoy';
  if (day === today + 1) return 'mañana';
  if (day === today - 1) return 'ayer';
  if (day > today && day - today < 7 - weekdayOf(today)) return `el ${weekdayName(day)}`;
  return `el ${formatDay(weekStart, day)}`;
}

/** "mié 16, 17:00". */
export function formatMoment(weekStart, minute) {
  return `${formatDay(weekStart, dayOf(minute), { short: true })}, ${formatClock(minute)}`;
}

/** "vence hoy", "vence mañana", "vence en 3 días", "venció ayer". */
export function formatDueIn(due, now) {
  const days = dayOf(due) - dayOf(now);
  if (due <= now) return days === 0 ? 'venció hoy' : days === -1 ? 'venció ayer' : `venció hace ${-days} días`;
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  return `vence en ${days} días`;
}

/** "hace un momento", "hace 25 min", "hace 3 h", "ayer", "hace 4 días". */
export function formatAgo(minute, now) {
  const diff = now - minute;
  if (diff < 2) return 'hace un momento';
  if (diff < 60) return `hace ${diff} min`;
  const days = dayOf(now) - dayOf(minute);
  if (days === 0) return `hace ${Math.floor(diff / 60)} h`;
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

export function greetingFor(now) {
  const minute = minuteOfDay(now);
  if (minute < 12 * 60) return 'Buenos días';
  if (minute < 19 * 60) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Une elementos al estilo del español: "a, b y c". */
export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

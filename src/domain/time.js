// Tiempo de la semana académica.
//
// Todo el dominio trabaja con "minutos de semana": minutos transcurridos desde
// el lunes 00:00 de la semana de referencia. Son enteros, no dependen de zonas
// horarias y se comparan directamente. Pueden ser negativos (semana anterior)
// o mayores a 10 080 (semana siguiente).

export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_WEEK = 7;

/** Granularidad de planeación: los bloques empiezan y terminan en :00 o :30. */
export const SLOT = 30;

export function dayOf(minute) {
  return Math.floor(minute / MINUTES_PER_DAY);
}

export function minuteOfDay(minute) {
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** 0 = lunes … 6 = domingo, también para días de otras semanas. */
export function weekdayOf(day) {
  return ((day % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
}

export function isWeekend(day) {
  return weekdayOf(day) >= 5;
}

export function parseClock(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minuto de semana para un día y una hora "HH:MM". */
export function at(day, hhmm) {
  return day * MINUTES_PER_DAY + parseClock(hhmm);
}

export function ceilTo(value, step = SLOT) {
  return Math.ceil(value / step) * step;
}

export function floorTo(value, step = SLOT) {
  return Math.floor(value / step) * step;
}

// ── Intervalos [inicio, fin) ────────────────────────────────────────────────

export function length([start, end]) {
  return end - start;
}

export function totalLength(intervals) {
  return intervals.reduce((sum, interval) => sum + length(interval), 0);
}

export function overlaps(a, b) {
  return a[0] < b[1] && b[0] < a[1];
}

export function contains(outer, inner) {
  return outer[0] <= inner[0] && inner[1] <= outer[1];
}

/** Resta `cuts` de `intervals`. Ambos pueden venir desordenados. */
export function subtract(intervals, cuts) {
  let result = intervals.map(([start, end]) => [start, end]);
  for (const [cutStart, cutEnd] of cuts) {
    const next = [];
    for (const [start, end] of result) {
      if (cutEnd <= start || cutStart >= end) {
        next.push([start, end]);
        continue;
      }
      if (cutStart > start) next.push([start, cutStart]);
      if (cutEnd < end) next.push([cutEnd, end]);
    }
    result = next;
  }
  return result.sort((a, b) => a[0] - b[0]);
}

/** Ajusta los intervalos a la rejilla de planeación y descarta los muy cortos. */
export function snapToSlots(intervals, step = SLOT) {
  return intervals
    .map(([start, end]) => [ceilTo(start, step), floorTo(end, step)])
    .filter(([start, end]) => end - start >= step);
}

// ── Fechas de calendario ────────────────────────────────────────────────────

export function toISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Lunes (local) de la semana que contiene `date`. */
export function mondayOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - weekdayOf(monday.getDay() - 1));
  return monday;
}

/** Fecha local del día `day` contado desde el lunes `weekStart` (YYYY-MM-DD). */
export function dateOfDay(weekStart, day) {
  const [year, month, date] = weekStart.split('-').map(Number);
  return new Date(year, month - 1, date + day);
}

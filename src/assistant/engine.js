// Motor conversacional basado en reglas.
//
// Es un adaptador: recibe el estado y un mensaje, y devuelve respuestas,
// acciones para el store y efectos para la app. No toca el DOM ni el store.
// Un motor con LLM implementaría la misma interfaz (`respond`, `briefing`,
// `syncReport`, `appliedNotice`) llamando a las mismas funciones de dominio
// como herramientas.

import { agendaForDay, currentAndNext, firstItemAfterToday } from '../domain/agenda.js';
import { studyCutoff } from '../domain/calendar.js';
import { createProposal } from '../domain/planner.js';
import { effortLeft, pendingTasks } from '../domain/tasks.js';
import { dayOf } from '../domain/time.js';
import { analyzeWeek } from '../domain/workload.js';
import { actions } from '../app/reducer.js';
import {
  capitalize,
  formatClock,
  formatDay,
  formatDuration,
  formatHours,
  formatMoment,
  formatRange,
  greetingFor,
  joinList,
  relativeDay,
  weekdayName,
} from '../shared/format.js';
import { dueChangeText, issueText } from '../shared/copy.js';
import { detectIntent, matchTasks } from './intents.js';

// Botones de respuesta rápida. WhatsApp permite hasta 3 por mensaje, de 20 caracteres.
export const BUTTONS = {
  today: { label: '¿Qué tengo hoy?', intent: 'today' },
  next: { label: '¿Qué sigue?', intent: 'next' },
  week: { label: '¿Cómo va mi semana?', intent: 'week' },
  deadlines: { label: 'Mis entregas', intent: 'deadlines' },
  rebalance: { label: 'Reorganizar semana', intent: 'rebalance' },
  apply: { label: 'Aplicar cambios', intent: 'confirm' },
  notNow: { label: 'Ahora no', intent: 'decline' },
  showWeek: { label: 'Ver en la app', intent: 'show', params: { view: 'week' } },
  details: { label: 'Ver detalles', intent: 'show', params: { view: 'week' } },
};

const LEVEL_WORDS = { free: 'libre', ok: 'holgado', tight: 'justo', over: 'sobrecarga' };

const reply = (text, extra = {}) => ({ from: 'mindos', text, ...extra });

const sourceName = (state, sourceId) => state.data.sources.find((source) => source.id === sourceId)?.name ?? sourceId;

function describeAgendaItem(item) {
  const label = item.kind === 'study' ? `Estudio: ${item.task.title}` : item.title;
  return `${formatRange(item.start, item.end)} ${label}${item.block?.done ? ' (hecho)' : ''}`;
}

function weekVerdict(analysis) {
  if (analysis.issues.length > 0) return 'Hay conflictos que conviene resolver.';
  if (analysis.days.some((day) => !day.past && day.level === 'tight')) return 'Exigente, pero viable.';
  return 'Tranquila: tienes margen.';
}

const bold = (text) => `*${text}*`;

function describeIssues(state, analysis) {
  return analysis.issues.map((issue) => `• ${issueText(issue, state.data, bold)}`);
}

function describeChange(state, change) {
  const task = state.data.tasks.find((item) => item.id === change.taskId);
  return dueChangeText(change, task, state.data, bold);
}

// ── Mensajes proactivos ────────────────────────────────────────────────────

export function briefing(state) {
  const { data } = state;
  const today = dayOf(data.now);
  const { items, deadlines } = agendaForDay(data, today);
  const commitments = items.filter((item) => item.kind !== 'study');
  const study = items.filter((item) => item.kind === 'study');
  const analysis = analyzeWeek(data);
  const nextDeadline = pendingTasks(data.tasks).find((task) => task.due > data.now);

  const lines = [`${greetingFor(data.now)}, ${data.profile.name}. Así viene tu ${weekdayName(today)}:`];
  if (commitments.length > 0) {
    lines.push('', '*Clases y compromisos*', ...commitments.map((item) => `${formatClock(item.start)} ${item.title}`));
  }
  lines.push('', '*Estudio planeado*');
  lines.push(...(study.length > 0 ? study.map((item) => `${formatRange(item.start, item.end)} ${item.task.title}`) : ['Hoy no tienes bloques de estudio.']));
  if (deadlines.length > 0) {
    lines.push('', '*Vence hoy*', ...deadlines.map((task) => `${formatClock(task.due)} ${task.title}`));
  } else if (nextDeadline) {
    lines.push('', `*Próxima entrega:* ${nextDeadline.title}, ${relativeDay(data.weekStart, dayOf(nextDeadline.due), data.now)} a las ${formatClock(nextDeadline.due)}.`);
  }
  lines.push(
    '',
    `Tu semana: ${formatDuration(analysis.totals.demand)} de trabajo para ${formatDuration(analysis.totals.capacity)} de enfoque. ${weekVerdict(analysis)}`,
  );
  return reply(lines.join('\n'), { buttons: [BUTTONS.next, BUTTONS.week] });
}

/** Resultado de una sincronización, con alerta si el cambio rompe el plan. */
export function syncReport(state, appliedChanges) {
  const { data } = state;
  const broken = data.sources.filter((source) => source.status === 'error');
  const brokenNote =
    broken.length > 0
      ? `\n\n${joinList(broken.map((source) => source.name))} necesita que vuelvas a autorizar el acceso. Mientras tanto uso la última copia.`
      : '';

  if (appliedChanges.length === 0) {
    return reply(`Revisé tus plataformas: no hay cambios desde la última sincronización.${brokenNote}`, {
      buttons: [BUTTONS.next, BUTTONS.week],
    });
  }

  const analysis = analyzeWeek(data);
  const lines = appliedChanges.map((change) => `*Cambio en ${sourceName(state, change.sourceId)}*\n${describeChange(state, change)}`);
  if (analysis.issues.length === 0) {
    lines.push('', 'Tu plan sigue funcionando: no hace falta mover nada.');
    return reply(lines.join('\n'), { tone: 'alert', buttons: [BUTTONS.week] });
  }
  lines.push('', 'Con este cambio:', ...describeIssues(state, analysis), '', '¿Reorganizo tu semana?');
  return reply(lines.join('\n'), {
    tone: 'alert',
    pending: { type: 'rebalance' },
    buttons: [BUTTONS.rebalance, BUTTONS.details, BUTTONS.notNow],
  });
}

/** Aviso en WhatsApp cuando el plan se cambia desde la app web. */
export function appliedNotice(state, proposal) {
  const moved = proposal.changes.length;
  return reply(
    `Actualicé tu plan desde la app: ${moved === 1 ? '1 cambio' : `${moved} cambios`}. ${
      proposal.issuesAfter === 0 ? 'Tu semana quedó sin conflictos.' : 'Todavía hay detalles por resolver.'
    }`,
    { tone: 'success', buttons: [BUTTONS.today, BUTTONS.week] },
  );
}

// ── Respuestas a mensajes ──────────────────────────────────────────────────

function agendaReply(state, day, heading) {
  const { data } = state;
  const { items, deadlines } = agendaForDay(data, day);
  const lines = [`*${heading}, ${formatDay(data.weekStart, day)}*`, ''];
  if (items.length === 0) lines.push('No tienes clases, compromisos ni bloques de estudio.');
  lines.push(...items.map(describeAgendaItem));
  if (deadlines.length > 0) {
    lines.push('', '*Vence*', ...deadlines.map((task) => `${formatClock(task.due)} ${task.title}`));
  }
  const last = items.at(-1);
  if (last) lines.push('', `Terminas a las ${formatClock(last.end)}. No agendo estudio después de las ${formatClock(studyCutoff(data.profile))} para cuidar tu sueño.`);
  return lines.join('\n');
}

const handlers = {
  today(state) {
    return { replies: [reply(agendaReply(state, dayOf(state.data.now), 'Hoy'), { buttons: [BUTTONS.next, BUTTONS.deadlines] })] };
  },

  tomorrow(state) {
    return { replies: [reply(agendaReply(state, dayOf(state.data.now) + 1, 'Mañana'), { buttons: [BUTTONS.deadlines, BUTTONS.week] })] };
  },

  next(state) {
    const { data } = state;
    const { current, next, later } = currentAndNext(data);
    const where = (item) => (item.event?.location ? `, en ${item.event.location}` : '');
    const lines = [];
    if (current) lines.push(`Ahora: *${current.title}*, hasta las ${formatClock(current.end)}.`);
    if (next) {
      lines.push(`${current ? 'Después' : 'Lo siguiente'}: *${next.kind === 'study' ? `Estudio de ${next.task.short}` : next.title}* a las ${formatClock(next.start)}${where(next)}.`);
      if (later[0]) lines.push(`Luego: ${later[0].kind === 'study' ? `estudio de ${later[0].task.short}` : later[0].title} a las ${formatClock(later[0].start)}.`);
    }
    if (!current && !next) {
      const upcoming = firstItemAfterToday(data);
      lines.push('Ya no tienes nada más hoy.');
      if (upcoming) {
        lines.push(`${capitalize(relativeDay(data.weekStart, dayOf(upcoming.start), data.now))} empiezas a las ${formatClock(upcoming.start)} con *${upcoming.title}*.`);
      }
    }
    return { replies: [reply(lines.join('\n'), { buttons: [BUTTONS.today, BUTTONS.week] })] };
  },

  deadlines(state) {
    const { data } = state;
    const analysis = analyzeWeek(data);
    const upcoming = pendingTasks(data.tasks).filter((task) => task.due > data.now).slice(0, 5);
    if (upcoming.length === 0) {
      return { replies: [reply('No tienes entregas pendientes. Buen momento para adelantar el proyecto.', { buttons: [BUTTONS.week] })] };
    }
    const lines = ['*Tus próximas entregas*', ''];
    for (const task of upcoming) {
      const missing = analysis.unplannedByTask.get(task.id);
      const status = missing
        ? `Trabajo pendiente: ${formatDuration(missing)} sin espacio en tu plan.`
        : `Trabajo pendiente: ${formatDuration(effortLeft(task, data.blocks))}, ya en tu plan.`;
      lines.push(`*${task.title}*`, `${formatMoment(data.weekStart, task.due)}, en ${sourceName(state, task.sourceId)}. ${status}`, '');
    }
    const hasGaps = upcoming.some((task) => analysis.unplannedByTask.has(task.id));
    return {
      replies: [reply(lines.join('\n').trim(), { buttons: hasGaps ? [BUTTONS.rebalance, BUTTONS.week] : [BUTTONS.next, BUTTONS.week] })],
    };
  },

  meetings(state) {
    const { data } = state;
    const today = dayOf(data.now);
    const meetings = data.events.filter((event) => event.kind === 'meeting' && event.end > data.now && dayOf(event.start) <= 6);
    const lines = [];
    if (!meetings.some((event) => dayOf(event.start) === today)) lines.push('Hoy no tienes reuniones.', '');
    if (meetings.length > 0) {
      lines.push('*Reuniones de esta semana*', '');
      for (const event of meetings) {
        lines.push(`${formatDay(data.weekStart, dayOf(event.start), { short: true })}, ${formatRange(event.start, event.end)} ${event.title} (${event.location}) con ${joinList(event.people)}`);
      }
      lines.push('', 'Te aviso 10 minutos antes de cada una.');
    }
    return { replies: [reply(lines.join('\n').trim(), { buttons: [BUTTONS.today, BUTTONS.week] })] };
  },

  week(state) {
    const { data } = state;
    const analysis = analyzeWeek(data);
    const lines = ['*Tu semana*', ''];
    for (const day of analysis.days.filter((entry) => !entry.past)) {
      const level = day.level === 'tight' || day.level === 'over' ? `, ${LEVEL_WORDS[day.level]}` : '';
      lines.push(`${weekdayName(day.day, { short: true })}: ${formatHours(day.demand)} de ${formatHours(day.capacity)}${level}`);
    }
    lines.push('', `Total: ${formatDuration(analysis.totals.demand)} de trabajo para ${formatDuration(analysis.totals.capacity)} de enfoque.`);
    if (analysis.issues.length > 0) {
      lines.push('', '*Ojo*', ...describeIssues(state, analysis), '', '¿Reorganizo tu semana?');
      return {
        replies: [reply(lines.join('\n'), { pending: { type: 'rebalance' }, buttons: [BUTTONS.rebalance, BUTTONS.showWeek, BUTTONS.notNow] })],
      };
    }
    lines.push(weekVerdict(analysis));
    return { replies: [reply(lines.join('\n'), { buttons: [BUTTONS.next, BUTTONS.deadlines] })] };
  },

  plan(state) {
    const { data } = state;
    const today = dayOf(data.now);
    const study = agendaForDay(data, today).items.filter((item) => item.kind === 'study');
    const lines = ['*Tu plan de estudio de hoy*', ''];
    if (study.length === 0) {
      lines.push('Hoy no tienes bloques de estudio.');
      const nextBlock = data.blocks.filter((block) => !block.done && block.start > data.now).sort((a, b) => a.start - b.start)[0];
      if (nextBlock) {
        const task = data.tasks.find((item) => item.id === nextBlock.taskId);
        lines.push(`El siguiente es ${relativeDay(data.weekStart, dayOf(nextBlock.start), data.now)} a las ${formatClock(nextBlock.start)}: *${task.title}*.`);
      }
    } else {
      lines.push(...study.map((item) => `${formatRange(item.start, item.end)} ${item.task.title}${item.block.done ? ' (hecho)' : ''}`));
      lines.push('', 'Trabaja en ciclos de 25 minutos con 5 de descanso. Te aviso 10 minutos antes de cada bloque.');
    }
    return { replies: [reply(lines.join('\n'), { buttons: [BUTTONS.rebalance, BUTTONS.week] })] };
  },

  rebalance(state) {
    const { data } = state;
    const proposal = createProposal(data);
    if (proposal.changes.length === 0 && proposal.unplaced.length === 0) {
      return {
        replies: [reply('Tu semana ya está en orden: todo cabe antes de su fecha y dentro de tus límites. No hace falta mover nada.', { buttons: [BUTTONS.next, BUTTONS.week] })],
      };
    }
    const taskById = new Map(data.tasks.map((task) => [task.id, task]));
    const when = (range) => `${relativeDay(data.weekStart, dayOf(range[0]), data.now)} ${formatRange(range[0], range[1])}`;
    const lines = ['Te propongo esto:', ''];
    for (const change of proposal.changes.slice(0, 4)) {
      const title = taskById.get(change.taskId).title;
      if (change.type === 'move') lines.push(`• *${title}*`, `  de ${when(change.from)} a ${when(change.to)}`);
      if (change.type === 'add') lines.push(`• *${title}*`, `  nuevo bloque ${when(change.to)}`);
      if (change.type === 'remove') lines.push(`• *${title}*`, `  quito el bloque de ${when(change.from)}`);
    }
    if (proposal.changes.length > 4) lines.push(`• y ${proposal.changes.length - 4} cambios más`);
    lines.push('');
    const relieved = proposal.impact.filter((entry) => entry.levelBefore === 'over' && entry.levelAfter !== 'over');
    for (const entry of relieved) {
      lines.push(`El ${weekdayName(entry.day)} pasa de ${formatHours(entry.before)} a ${formatHours(entry.after)} de trabajo.`);
    }
    for (const gap of proposal.unplaced) {
      lines.push(`*No alcanza para todo:* faltan ${formatDuration(gap.minutes)} para *${taskById.get(gap.taskId).title}*. Te sugiero pedir una prórroga.`);
    }
    if (proposal.extendedDays.length > 0) {
      lines.push(`Para lograrlo excedo tu límite de enfoque el ${joinList(proposal.extendedDays.map((day) => weekdayName(day)))}.`);
    }
    lines.push(`Tu hora de dormir no cambia: nada después de las ${formatClock(studyCutoff(data.profile))}.`, '', '¿Aplico los cambios?');
    return {
      replies: [reply(lines.join('\n'), { pending: { type: 'proposal' }, buttons: [BUTTONS.apply, BUTTONS.showWeek, BUTTONS.notNow] })],
      actions: [actions.proposalReady(proposal)],
    };
  },

  confirm(state) {
    if (state.chat.pending?.type === 'rebalance') return handlers.rebalance(state);
    const proposal = state.proposal.value;
    if (!proposal) {
      return { replies: [reply('No tengo cambios pendientes por aplicar.', { buttons: [BUTTONS.week] })] };
    }
    return {
      replies: [
        reply(
          `Listo, apliqué ${proposal.changes.length === 1 ? 'el cambio' : `los ${proposal.changes.length} cambios`}. ${
            proposal.issuesAfter === 0 ? 'Tu semana quedó sin conflictos' : 'Tu semana mejoró, aunque hay detalles pendientes'
          } y la app ya muestra el plan nuevo.`,
          { tone: 'success', buttons: [BUTTONS.today, BUTTONS.week] },
        ),
      ],
      actions: [actions.proposalApplied()],
    };
  },

  decline() {
    return {
      replies: [reply('Entendido, no muevo nada. Si cambias de opinión, escribe «reorganiza».', { buttons: [BUTTONS.today, BUTTONS.week] })],
      actions: [actions.proposalDismissed()],
    };
  },

  complete(state, input) {
    const { data } = state;
    const pending = pendingTasks(data.tasks);
    let task = null;
    let options = pending;
    if (input.params?.taskId) {
      task = pending.find((item) => item.id === input.params.taskId) ?? null;
    } else {
      const matches = matchTasks(input.text, pending);
      if (matches.length === 1 || (matches.length > 1 && matches[0].score > matches[1].score)) task = matches[0].task;
      if (matches.length > 0) options = matches.map((entry) => entry.task);
    }

    if (!task) {
      return {
        replies: [
          reply('¿Cuál terminaste?', {
            buttons: options.slice(0, 3).map((item) => ({ label: item.short, intent: 'complete', params: { taskId: item.id } })),
          }),
        ],
      };
    }
    const freed = data.blocks
      .filter((block) => block.taskId === task.id && !block.done && block.start >= data.now)
      .reduce((sum, block) => sum + block.end - block.start, 0);
    const freedText = freed > 0 ? ` y liberé ${formatDuration(freed)} de tu plan` : '';
    return {
      replies: [reply(`Buen trabajo. Marqué *${task.title}* como terminada${freedText}.`, { tone: 'success', buttons: [BUTTONS.next, BUTTONS.week] })],
      actions: [actions.taskDone(task.id, true)],
    };
  },

  changes() {
    return { replies: [reply('Reviso tus plataformas…')], effects: [{ type: 'sync' }] };
  },

  sleep(state) {
    const { profile, sleepLog } = state.data;
    const average = sleepLog.reduce((sum, minutes) => sum + minutes, 0) / sleepLog.length;
    return {
      replies: [
        reply(
          [
            `Tu meta es dormir ${formatDuration(profile.sleep.goalMinutes)}, de ${profile.sleep.bedtime} a ${profile.sleep.wake}.`,
            `Las últimas ${sleepLog.length} noches dormiste ${formatDuration(Math.round(average / 5) * 5)} en promedio.`,
            '',
            `Por eso no agendo estudio después de las ${formatClock(studyCutoff(profile))}, aunque haya prisa.`,
          ].join('\n'),
          { buttons: [BUTTONS.today, BUTTONS.week] },
        ),
      ],
    };
  },

  show(state, input) {
    return {
      replies: [reply('Te lo muestro en la app, en la sección *Semana*.')],
      effects: [{ type: 'navigate', view: input.params?.view ?? 'week' }],
    };
  },

  greeting(state) {
    return { replies: [reply(`Hola, ${state.data.profile.name}. ¿En qué te ayudo?`, { buttons: [BUTTONS.today, BUTTONS.week, BUTTONS.deadlines] })] };
  },

  help() {
    return {
      replies: [
        reply(
          [
            'Puedo ayudarte con esto:',
            '',
            '• Tu agenda: «¿qué tengo hoy?» o «¿qué tengo mañana?»',
            '• Tus entregas: «¿qué entregas tengo?»',
            '• Tu carga: «¿cómo va mi semana?»',
            '• Tu plan: «reorganiza mi semana»',
            '• Tus avances: «ya terminé el reporte de VLSM»',
          ].join('\n'),
          { buttons: [BUTTONS.today, BUTTONS.week, BUTTONS.deadlines] },
        ),
      ],
    };
  },

  thanks() {
    return { replies: [reply('Con gusto. Te escribo si algo cambia en tus plataformas.')] };
  },

  unknown() {
    return {
      replies: [
        reply('No entendí ese mensaje. Puedo decirte qué tienes hoy, cómo va tu semana o reorganizar tu plan.', {
          buttons: [BUTTONS.today, BUTTONS.week, BUTTONS.deadlines],
        }),
      ],
    };
  },
};

/**
 * @param {object} state  Estado completo de la app.
 * @param {{ text: string, intent?: string, params?: object }} input
 * @returns {{ intent: string, replies: object[], actions: object[], effects: object[] }}
 */
export function respond(state, input) {
  const intent = input.intent ?? detectIntent(input.text, { pending: state.chat.pending }).intent;
  const handler = handlers[intent] ?? handlers.unknown;
  const result = handler(state, input);
  return { intent, replies: result.replies ?? [], actions: result.actions ?? [], effects: result.effects ?? [] };
}

export const ruleBasedAssistant = { respond, briefing, syncReport, appliedNotice };

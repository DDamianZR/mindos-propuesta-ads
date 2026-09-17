// Vista previa del canal de WhatsApp. Se actualiza de forma incremental:
// solo agrega mensajes nuevos, para conservar el scroll y no repetir animaciones.

import { formatClock } from '../shared/format.js';
import { h, richText } from './dom.js';
import { icon } from './icons.js';

export function mountChat(container, { commands }) {
  const typing = h(
    'div',
    { class: 'wa-message wa-typing', hidden: true },
    h('div', { class: 'bubble bubble--in' }, h('span', { class: 'sr-only' }, 'MindOS está escribiendo'), h('span', { class: 'wa-dot' }), h('span', { class: 'wa-dot' }), h('span', { class: 'wa-dot' })),
  );
  const log = h(
    'div',
    { class: 'wa-log', role: 'log', 'aria-label': 'Conversación con MindOS', tabindex: '0' },
    h('p', { class: 'wa-day' }, 'Hoy'),
    typing,
  );
  const status = h('p', { class: 'wa-status' }, 'Asistente académico');
  const input = h('input', {
    class: 'wa-input',
    id: 'chat-input',
    type: 'text',
    autocomplete: 'off',
    enterkeyhint: 'send',
    maxlength: '280',
    placeholder: 'Escribe un mensaje',
  });
  const form = h(
    'form',
    {
      class: 'wa-composer',
      onSubmit: (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        commands.ask({ text });
      },
    },
    h('label', { class: 'sr-only', for: 'chat-input' }, 'Mensaje para MindOS'),
    input,
    h('button', { class: 'wa-send', type: 'submit', 'aria-label': 'Enviar mensaje' }, icon('send', { size: 20 })),
  );

  container.append(
    h(
      'div',
      { class: 'device' },
      h(
        'div',
        { class: 'device__screen' },
        h(
          'header',
          { class: 'wa-header' },
          h('span', { class: 'wa-avatar', 'aria-hidden': 'true' }, 'M'),
          h('div', { class: 'wa-heading' }, h('h2', { class: 'wa-name' }, 'MindOS'), status),
        ),
        log,
        form,
      ),
    ),
    h('p', { class: 'device__caption' }, 'Vista previa del canal de WhatsApp'),
  );

  let renderedIds = [];
  let wasTyping = null;
  let wasVisible = false;
  let activeId = undefined;

  function renderMessage(message) {
    const outgoing = message.from === 'user';
    return h(
      'div',
      { class: ['wa-message', outgoing ? 'wa-message--out' : 'wa-message--in'], dataset: { messageId: message.id } },
      h(
        'div',
        { class: ['bubble', outgoing ? 'bubble--out' : 'bubble--in', message.tone && `bubble--${message.tone}`] },
        h('span', { class: 'sr-only' }, outgoing ? 'Tú: ' : 'MindOS: '),
        h('p', { class: 'bubble__text' }, richText(message.text)),
        h(
          'p',
          { class: 'bubble__meta' },
          h('time', {}, formatClock(message.at)),
          outgoing && icon('checks', { size: 16, className: 'bubble__read', label: 'Leído' }),
        ),
      ),
      message.buttons?.length > 0 &&
        h(
          'div',
          { class: 'wa-actions', role: 'group', 'aria-label': 'Respuestas rápidas' },
          message.buttons.map((reply) => h('button', { type: 'button', class: 'wa-action', onClick: () => commands.ask(reply) }, reply.label)),
        ),
    );
  }

  function update(state) {
    const { messages, typing: isTyping } = state.chat;
    const diverged = messages.length < renderedIds.length || renderedIds.some((id, index) => messages[index]?.id !== id);
    if (diverged) {
      for (const node of log.querySelectorAll('.wa-message[data-message-id]')) node.remove();
      renderedIds = [];
    }

    const fresh = messages.slice(renderedIds.length);
    for (const message of fresh) {
      log.insertBefore(renderMessage(message), typing);
      renderedIds.push(message.id);
    }

    // Solo las respuestas rápidas del último mensaje de MindOS siguen vigentes.
    const last = messages.at(-1);
    const nextActiveId = last?.from === 'mindos' && !isTyping ? last.id : null;
    if (nextActiveId !== activeId || fresh.length > 0 || diverged) {
      for (const node of log.querySelectorAll('.wa-message[data-message-id]')) {
        const enabled = node.dataset.messageId === nextActiveId;
        for (const action of node.querySelectorAll('.wa-action')) action.disabled = !enabled;
      }
      activeId = nextActiveId;
    }

    if (isTyping !== wasTyping) {
      typing.hidden = !isTyping;
      status.textContent = isTyping ? 'escribiendo…' : 'Asistente académico';
      wasTyping = isTyping;
    }

    // Si el chat estaba oculto (móvil), los mensajes nuevos no pudieron desplazarlo:
    // al mostrarse, baja hasta el último.
    const visible = log.getClientRects().length > 0;
    if (fresh.length > 0 || isTyping || (visible && !wasVisible)) log.scrollTop = log.scrollHeight;
    wasVisible = visible;
  }

  return { update };
}

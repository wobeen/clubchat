// Unsent text and reading position belong to the view, not the saved meeting.
const views = new Map();
let renderedId;
export function captureView() {
  if (!renderedId) return;
  const composer = document.querySelector('#composer textarea');
  const messages = document.querySelector('#messages');
  const previous = views.get(renderedId) || {};
  views.set(renderedId, {
    ...previous,
    ...(composer ? { text: composer.value, start: composer.selectionStart, end: composer.selectionEnd, focused: document.activeElement === composer } : {}),
    ...(messages ? { scroll: messages.scrollTop, bottom: messages.scrollHeight - messages.scrollTop - messages.clientHeight < 32 } : {}),
  });
}
export function restoreView(id) {
  renderedId = id;
  const saved = views.get(id);
  const composer = document.querySelector('#composer textarea');
  const messages = document.querySelector('#messages');
  if (composer && saved) {
    composer.value = saved.text || '';
    if (saved.focused) { composer.focus(); composer.setSelectionRange(saved.start || 0, saved.end || 0); }
  }
  if (messages) messages.scrollTop = !saved || saved.bottom ? messages.scrollHeight : saved.scroll;
}
export function clearComposer(id) {
  views.set(id, { text: '', start: 0, end: 0, focused: true, bottom: true });
  const composer = document.querySelector('#composer textarea');
  if (composer) composer.value = '';
}

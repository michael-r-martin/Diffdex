// Injected into the pinned Codex webview. The caller passes the resolved server ID.
let __diffLabLastSelection;
let __diffLabSentSelection;
function __diffLabSendSelection(force = false) {
  if (document.hidden || __diffLabLastSelection === undefined) return;
  if (!force && __diffLabSentSelection === __diffLabLastSelection) return;
  mm.postMessage({ type: 'codex-diff-active-chat', id: __diffLabLastSelection });
  __diffLabSentSelection = __diffLabLastSelection;
}
function __diffLabSelection(id) {
  __diffLabLastSelection = id ?? null;
  // Coalesce React renders and send after the current render has completed.
  queueMicrotask(() => __diffLabSendSelection());
}
window.addEventListener('focus', () => __diffLabSendSelection(true));
document.addEventListener('visibilitychange', () => __diffLabSendSelection(true));

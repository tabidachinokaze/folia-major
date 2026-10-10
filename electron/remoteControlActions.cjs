// electron/remoteControlActions.cjs
// IPC carries descriptions and activation tickets, never executable callbacks.
const text = (value, limit = 256) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const track = value => value === null || text(value, 1024);
function sanitizeRemoteControls(value) {
  if (!value || !text(value.epoch) || !Number.isSafeInteger(value.revision) || value.revision < 1 || !track(value.trackKey)) return undefined;
  const ids = new Set();
  const list = items => {
    if (!Array.isArray(items) || items.length > 32) throw new Error('Invalid action list');
    return items.map(item => {
      if (!item || !text(item.id) || ids.has(item.id) || !text(item.handle) || !text(item.icon)
        || !item.label || typeof item.label !== 'object' || Array.isArray(item.label)
        || Object.keys(item.label).length > 32
        || Object.entries(item.label).some(([locale, label]) => !text(locale, 32) || (label !== undefined && (typeof label !== 'string' || label.length > 2048)))
        || [item.disabled, item.pressed, item.primary].some(flag => flag !== undefined && typeof flag !== 'boolean')
        || (item.count !== undefined && (!Number.isFinite(item.count) || item.count < 0))
        || (item.tone !== undefined && !['normal', 'alert'].includes(item.tone))) throw new Error('Invalid action');
      ids.add(item.id);
      return { id: item.id, handle: item.handle, icon: item.icon, label: { ...item.label },
        disabled: item.disabled, pressed: item.pressed, primary: item.primary, count: item.count, tone: item.tone };
    });
  };
  try {
    return { epoch: value.epoch, revision: value.revision, trackKey: value.trackKey, transport: list(value.transport), actions: list(value.actions) };
  } catch { return undefined; }
}
function isCurrentRemoteAction(command, snapshot) {
  const controls = snapshot?.remoteControls;
  if (!controls || command?.type !== 'remote-action' || (command.group !== 'transport' && command.group !== 'actions')
    || command.epoch !== controls.epoch || command.revision !== controls.revision
    || command.trackKey !== controls.trackKey || command.trackKey !== snapshot.trackKey) return false;
  return controls[command.group].some(item => item.id === command.id && item.handle === command.handle && !item.disabled);
}
module.exports = { sanitizeRemoteControls, isCurrentRemoteAction };

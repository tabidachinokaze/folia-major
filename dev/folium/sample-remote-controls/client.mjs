// dev/folium/sample-remote-controls/client.mjs
// No account, room, network, or playback-control permissions are needed.
export default function activate(folium) {
  if (folium.host.folium.minor < 5) throw new Error('This demo requires Folium 1.5 remoteControls.');
  let handle = null;
  let count = 0;
  let reverse = false;
  let replaceLoop = false;
  const log = (action, context) => folium.log.info('Remote action demo', { action, count, song: context.song?.id ?? null });
  const register = () => {
    if (handle) return;
    handle = folium.registries.remoteControls.register({ id: 'actions', edit(event) {
      if (reverse) event.transport.reverse();
      if (replaceLoop) {
        const loop = event.transport.find(item => item.id === 'host:loop');
        if (loop) { loop.label = { en: 'Demo action replacing loop', 'zh-CN': '替换循环的示例动作' }; loop.icon = 'info'; loop.run = () => log('replace-loop', event.context); }
      }
      event.actions.unshift({ id: 'sample-remote-controls:vote', icon: 'thumbs-up', label: { en: 'Demo reaction', 'zh-CN': '示例点赞' }, count,
        run() { count++; log('vote', event.context); folium.ui.refreshRemoteControls(); } });
    } });
  };
  register();
  const commands = [
    ['toggle', 'Toggle remote demo / 启停遥控示例', () => { if (handle) { handle.unregister(); handle = null; } else register(); }],
    ['reverse', 'Reverse remote buttons / 反转遥控按钮', () => { reverse = !reverse; folium.ui.refreshRemoteControls(); }],
    ['replace', 'Replace remote loop / 替换遥控循环动作', () => { replaceLoop = !replaceLoop; folium.ui.refreshRemoteControls(); }],
  ].map(([id, label, run]) => folium.registries.commands.register({ id, label: { en: label }, run }));
  return () => { handle?.unregister(); commands.forEach(command => command.unregister()); };
}

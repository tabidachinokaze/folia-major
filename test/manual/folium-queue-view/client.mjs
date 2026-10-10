// test/manual/folium-queue-view/client.mjs
// Uses only public UI APIs. The same media appears twice with independent occurrence IDs.
export default function activate(folium) {
  if (folium.env.context !== 'main' || folium.host.folium.minor < 5) return () => {};
  const listeners = new Set(), logReaders = new Set(), logs = [];
  const label = (en, zh = en) => ({ en, 'zh-CN': zh });
  const record = (message) => {
    logs.push(message); if (logs.length > 40) logs.shift();
    folium.log.info(message); logReaders.forEach(read => read());
  };
  const notify = () => listeners.forEach(read => read());
  let next = 2, edited = false, handle;
  const entry = (id, overline) => ({ id,
    track: { id: 'demo-same-media', source: 'netease', title: 'Same media / 同一首歌', artist: 'Sample artist', duration: 180 },
    overline: label(overline), actions: [{ id: 'vote', label: label('Vote', '房间点赞'), icon: 'thumbs-up', count: 0 }],
  });
  let state = { entries: [entry('one', 'Alice'), entry('two', 'System recommendation / 系统推荐')], currentId: 'one',
    actions: [{ id: 'sync', label: label('Sync queue', '同步队列'), icon: 'refresh-cw' }] };
  const show = () => {
    if (handle) return;
    handle = folium.registries.queueViews.register({ id: 'demo', getSnapshot: () => state,
      subscribe: read => { listeners.add(read); return () => listeners.delete(read); },
      onAction: ({ entryId, actionId }) => {
        record(`${actionId} ${entryId ?? '(header)'}`);
        if (actionId === 'vote') {
          state = { ...state, entries: state.entries.map(item => item.id === entryId
            ? { ...item, actions: [{ ...item.actions[0], count: item.actions[0].count + 1 }] } : item) };
          notify();
        }
      },
    });
    record('show demo UI'); folium.ui.slots.invalidate();
  };
  const restore = () => { handle?.unregister(); handle = undefined; record('restore native UI'); folium.ui.slots.invalidate(); };
  const insert = () => { state = { ...state, entries: [...state.entries, entry(`new-${++next}`, `New ${next}`)] }; record('insert occurrence'); notify(); };
  const item = (id, en, run) => ({ id: `${folium.modId}:${id}`, kind: 'button', label: label(en), icon: 'plus', run });
  const stops = [
    folium.ui.slots.register('command.toolbar', event => {
      if (!handle || !edited || event.context.commandId !== 'queue') return;
      const help = event.slots.leading.find(row => row.id === 'host:queue-help');
      if (help) help.label = label('Edited native help', '已改写宿主提示');
      event.slots.trailing.unshift(item('toolbar-first', 'Inserted first', () => record('toolbar first action')));
    }),
    folium.ui.slots.register('queue.header', event => {
      if (handle && edited) event.slots.trailing.unshift(item('header-first', 'Header action', () => record('header action')));
    }),
    folium.ui.slots.register('queue.entry', event => {
      if (!handle || !edited) return;
      event.slots.overline.push({ id: `${folium.modId}:metadata`, kind: 'text', label: label('Added metadata') });
      event.slots.actions.unshift(item('entry-first', 'Entry action', () => record(`entry ${event.context.entityId}`)));
    }),
    folium.ui.slots.register('lattice.tools', event => {
      if (handle && edited) event.slots.actions.unshift(item('wall-first', 'Wall action', () => record('wall action')));
    }),
  ];
  const panel = folium.registries.playerPanelTabs.register({ id: 'queue-demo', icon: 'list-music', label: label('Queue demo', '队列示例'),
    mount: (container) => {
      const buttons = document.createElement('div'), pre = document.createElement('pre');
      buttons.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'; pre.style.cssText = 'font-size:11px;white-space:pre-wrap;margin:12px 0';
      const controls = [
        ['Insert occurrence / 增', insert],
        ['Delete last / 删', () => {
          const entries = state.entries.slice(0, -1);
          state = { ...state, entries, currentId: entries.some(row => row.id === state.currentId) ? state.currentId : entries[0]?.id ?? null };
          record('delete occurrence'); notify();
        }],
        ['Reverse / 重排', () => { state = { ...state, entries: [...state.entries].reverse() }; record('reverse occurrences'); notify(); }],
        ['Edit lists / 改插槽', () => { edited = !edited; record('toggle list edits'); folium.ui.slots.invalidate(); }],
        ['Restore native / 恢复宿主', restore], ['Show demo / 显示示例', show],
      ];
      controls.forEach(([text, run]) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
        button.style.cssText = 'padding:6px 9px;border-radius:8px;background:rgba(128,128,128,.18)';
        button.onclick = run; buttons.append(button);
      });
      const render = () => { pre.textContent = logs.join('\n'); }; logReaders.add(render); render(); container.append(buttons, pre);
      return () => { logReaders.delete(render); buttons.remove(); pre.remove(); };
    },
  });
  show();
  return () => { stops.forEach(stop => stop()); restore(); panel.unregister(); };
}

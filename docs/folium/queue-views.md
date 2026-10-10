# 队列界面扩展（Folium 1.5）

`folium.registries.queueViews` 发布模组自己的队列显示。宿主在播放器队列标签页、队列命令面板和 Lattice 队列拼贴中显示同一批条目、推荐者与动作。`folium.ui.slots` 编辑这些位置的有序控件列表。两个接口都是 UI 扩展，不需要播放权限。

注册队列显示不会停止、替换、持久化或接管宿主播放；宿主的私人队列保持原样。选中显示条目默认只消费这次选择；声明 `defaultAction` 才转发对应的条目动作。UI 扩展本身不会加载音频、跳转本机进度或取得播放控制权。Lattice 中这类条目也不借用私人播放的歌词或进度。需要音频控制时，应另用支持该能力的接口。

## 发布队列显示

```js
let snapshot = {
  currentId: 'request-17',
  entries: [{
    id: 'request-17',
    track: { id: '123', source: 'netease', title: '歌曲', artist: '歌手', duration: 180 },
    overline: { 'zh-CN': '推荐者', en: 'Recommender' },
    actions: [{ id: 'vote', icon: 'thumbs-up', label: { 'zh-CN': '点赞', en: 'Vote' }, count: 0 }],
  }],
  actions: [{ id: 'sync', icon: 'refresh-cw', label: { 'zh-CN': '同步队列', en: 'Sync queue' } }],
};
const listeners = new Set();
const handle = folium.registries.queueViews.register({
  id: 'queue',
  getSnapshot: () => snapshot,
  subscribe: read => { listeners.add(read); return () => listeners.delete(read); },
  onAction: async ({ entryId, actionId }) => {
    // entryId 为 null 表示标题动作；其他值为原始 entries[].id。
    // 此处调用模组自己的业务逻辑，再替换 snapshot 并通知 listeners。
  },
});
```

`entries[].id` 是一次推荐或队列条目的业务身份。相同歌曲重复出现时使用不同条目 ID；重排、筛选、更新计数时保留 ID，不要使用列表下标生成 ID。`currentId` 必须对应条目 ID；没有高亮条目时用 `null`。空列表也使用 `currentId: null`。曲目 ID 与来源表示媒体身份，`duration` 单位为秒；`totalCount` 可显示尚未完整载入的总数。

`overline` 可显示推荐者或“系统推荐”。动作 ID 与注册 ID 使用相同的规则：`/^[a-z0-9][a-z0-9-]*$/`。条目动作由模组提供，宿主不会替这类队列执行私人队列的置顶、移除或批量修改。`count` 只是计数，每次点击都可派发；需要禁止操作时更新 `disabled`。房间点赞、歌曲个人红心收藏可以分别提供动作、标签与业务回调，不会因图标相似自动合并。

同时只允许一个队列显示源；另一个注册会抛出 `queue-view-busy`。禁用、重载、卸载模组或调用 `handle.unregister()` 后，宿主恢复私人队列显示。无效的初始数据拒绝注册，无效的后续更新保留最后一次有效显示并报告错误。每次执行动作前，宿主重新读取源快照，拒绝已删除、已禁用或已注销的条目和动作；注册重新启用后也不会复活旧回调。

使用 `subscribe` 宣告条目、顺序、推荐者、计数和可用性等离散变化。只更新计数时，媒体对象与队列搜索缓存保持不变。不要为播放时钟的每一帧发布快照。

## 支持的位置

| target | 列表 | 当前 context |
| --- | --- | --- |
| `command.toolbar` | `leading` / `trailing` | `surface: palette`、`commandId: queue`、`query`、`locale`；目前只在队列命令中提供 |
| `queue.header` | `leading` / `trailing` | `surface: panel` |
| `queue.entry` | `overline` / `actions` | `surface: panel/palette/lattice`、`entityId`、`song`、`values.current` |
| `lattice.tools` | `actions` | `surface: lattice`；真实 Lattice 工具菜单 |

调用 `folium.ui.slots.list()` 可检查支持的目标、列表与类型。普通列表接受 `text`、`button`、`toggle`；`overline` 只接受文字。现有控件使用 `host:*` ID，例如 `host:queue-help`、`host:queue-keep-open`、`host:queue-wall`、`host:queue-play-next`。新增控件必须用自己的 `folium.modId` 前缀，整个目标的 ID 不能重复。

```js
const stop = folium.ui.slots.register('command.toolbar', event => {
  if (event.context.commandId !== 'queue') return;
  event.slots.trailing.unshift({
    id: `${folium.modId}:sync`, kind: 'button', icon: 'refresh-cw',
    label: { 'zh-CN': '同步', en: 'Sync' }, run: () => syncMyQueue(),
  });
});
```

`event.slots` 是本次新建的有序列表；可用标准数组操作插入、删除、移动和重排，也可改写已有标签、图标和回调。`unshift` 会把原第一项移到第二项。编辑器按优先级和注册顺序运行，默认 `normal`；一个编辑器报错或产出无效列表时，只撤销该编辑器的修改。

编辑器必须同步且无副作用。异步请求应在动作回调中进行，再更新模组状态并调用 `folium.ui.slots.invalidate(target?, entityId?)`。不要保存事件对象后修改，也不要在编辑器里注册其他编辑器。宿主复制结果，处理异步回调错误，并在执行时重新检查列表与所属注册仍有效。改写 `disabled` 字段不会使原本禁用的宿主回调变得可执行。

`stop()` 撤销编辑器，原生默认列表自动恢复。导出窗口中的列表编辑器与队列显示注册是无效操作。模组应先检查 `folium.host.folium.minor >= 5`；完整公开 API 演示和日志见 [手工测试模组](../../test/manual/folium-queue-view/README.md)。

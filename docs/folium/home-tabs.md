# 首页页面

Folium 1.5 提供 `folium.registries.homeTabs` 与 `folium.ui.openHomeTab(localId)`。入口追加到 Grid 与 Bravais 的首页导航；宿主提供完整页面容器和返回原生首页的导航。模组页面在自己的 ShadowRoot 中渲染，不需要访问宿主 DOM。

```js
const page = folium.registries.homeTabs.register({
  id: 'messages',
  label: { 'zh-CN': '消息', en: 'Messages' },
  order: 200,
  mount(container, ctx) {
    const input = document.createElement('textarea');
    container.append(input);
    return () => { /* 移除监听、释放页面资源 */ };
  },
});
folium.ui.openHomeTab('messages');
```

注册 ID 由宿主加上模组名字空间；`openHomeTab` 只接受该模组仍已注册的本地 ID，不允许打开其他模组的页面。`order` 默认 500，只决定附加入口之间的排序；原生页签顺序保持原样。

容器有确定宽高；页面内容应使用 `min-width: 0` / `min-height: 0` 和适当的内部滚动布局。宿主为容器提供 `--folium-*` 主题变量，`ctx.getTheme()` / `ctx.subscribe()` 与播放器面板页签相同。语言变化会以新 `ctx.locale` 重新挂载。

选中页面时原生首页保持挂载并停止交互，因此返回时其资源和页签状态仍在。Grid 的 Tab / Shift+Tab 循环包含扩展入口；页面打开后聚焦自己的导航项，Tab 进入页面控件。页面输入由模组处理，不触发宿主直接输入搜索或页签快捷键；Ctrl+K（macOS 为 Cmd+K）仍可打开宿主命令面板。注册表不管理账号：模组应按自己的账号或来源状态注册和注销入口。

离开页面或首页时执行 mount 返回的清理函数；注销显示中的入口、禁用模组或卸载模组会立即返回原生首页。重新注册同一个 ID 不受旧注销句柄影响。UI 注册在导出窗口中为空操作，`openHomeTab` 在导出窗口中不可用。

可以使用 [sample-home-tab](../../dev/folium/sample-home-tab/README.md) 进行离线验证，不需要真实账号。

// dev/folium/player-layout-demo/client.mjs
// A small, account-free example: all geometry comes from the public stage context.

export function mountPlayerLayoutDemo(container, ctx) {
    const chat = document.createElement('div');
    const dialog = document.createElement('div');
    for (const box of [chat, dialog]) {
        box.style.cssText = 'position:fixed;box-sizing:border-box;padding:12px;border:1px solid #a78bfa;background:#231e38dd;color:#f5f3ff;border-radius:18px;overflow:hidden;pointer-events:auto;font:14px/1.6 system-ui;';
        container.appendChild(box);
    }
    chat.dataset.layoutDemoChat = '';
    dialog.dataset.layoutDemoDialog = '';
    chat.textContent = Array.from({ length: 60 }, (_, index) => `示例用户 ${index + 1}：这条消息只用于检查控件避让。`).join('\n');
    chat.style.whiteSpace = 'pre-line';
    dialog.textContent = '示例私信气泡\n窗口和侧栏变化时跟随可用空间。';
    dialog.style.whiteSpace = 'pre-line';
    let previous;
    const update = () => {
        const layout = ctx.getLayout?.() ?? null;
        if (layout === previous) return;
        previous = layout;
        container.dataset.layoutDemoSnapshot = JSON.stringify(layout);
        for (const box of [chat, dialog]) box.hidden = !layout;
        if (!layout) return;
        const { bounds, obstacles } = layout;
        const margin = 24;
        const width = Math.max(0, Math.min(300, bounds.width - margin * 2));
        const left = bounds.left + margin;
        let right = bounds.left + bounds.width - margin - width;
        // A tall native surface at the right edge is a side panel, not a bottom button.
        for (const { rect } of obstacles) {
            if (rect.height > bounds.height / 2 && rect.left > bounds.left + bounds.width / 2 && rect.left < right + width)
                right = Math.max(left, rect.left - margin - width);
        }
        const position = (box, x, desiredHeight) => {
            let top = bounds.top + margin;
            let bottom = bounds.top + bounds.height - margin;
            for (const { rect } of obstacles) {
                if (rect.left >= x + width || rect.left + rect.width <= x) continue;
                if (rect.top < bounds.top + bounds.height / 2) top = Math.max(top, rect.top + rect.height + 12);
                else bottom = Math.min(bottom, rect.top - 12);
            }
            box.style.left = `${x}px`;
            box.style.top = `${top}px`;
            box.style.width = `${width}px`;
            box.style.height = `${Math.max(0, Math.min(desiredHeight, bottom - top))}px`;
        };
        position(chat, left, bounds.height);
        position(dialog, right, 96);
        if (right < left + width + 12) {
            const top = Number.parseFloat(dialog.style.top) + Number.parseFloat(dialog.style.height) + 12;
            const bottom = Number.parseFloat(chat.style.top) + Number.parseFloat(chat.style.height);
            chat.style.top = `${top}px`;
            chat.style.height = `${Math.max(0, bottom - top)}px`;
        }
        for (const box of [chat, dialog]) box.hidden = Number.parseFloat(box.style.height) < 32;
    };
    const off = ctx.subscribe(update);
    update();
    return () => { off(); chat.remove(); dialog.remove(); delete container.dataset.layoutDemoSnapshot; };
}

export default function activate(folium) {
    if (folium.host.folium.minor < 5) return;
    folium.registries.stageLayers.register({
        id: 'safe-area-demo', slot: 'app.overlay', mount: mountPlayerLayoutDemo,
    });
}

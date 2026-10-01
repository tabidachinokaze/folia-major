// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Heart, Users, type LucideIcon } from 'lucide-react';
import { FoliumPanelTabIcon } from '@/mods/folium/FoliumPanelTabIcon';
import { playerPanelTabsRegistry, useFoliumPanelTabs } from '@/mods/folium/registries/playerPanelTabs';

// test/unit/mod-system/foliumPanelTabIcon.test.ts
const load = vi.hoisted(() => vi.fn());
vi.mock('@/mods/folium/icons', () => ({ loadFoliumIconComponent: load }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    playerPanelTabsRegistry.unregisterAll('test-icons');
    load.mockReset();
    document.body.replaceChildren();
});
async function render(name?: string) {
    if (!root) {
        const container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    }
    await act(async () => { root!.render(React.createElement(FoliumPanelTabIcon, { name })); });
}

describe('mod player-panel icons', () => {
    it('does not expose malformed JavaScript icon values as React components', async () => {
        playerPanelTabsRegistry.register('test-icons', { id: 'bad', label: { en: 'Bad' }, mount: () => {}, icon: 42 as unknown as string });
        playerPanelTabsRegistry.register('test-icons', { id: 'good', label: { en: 'Good' }, mount: () => {}, icon: 'users' });
        let tabs: ReturnType<typeof useFoliumPanelTabs> = [];
        function Probe() { tabs = useFoliumPanelTabs(); return null; }
        await render();
        await act(async () => { root!.render(React.createElement(Probe)); });
        expect(tabs.map(tab => tab.icon)).toEqual([undefined, 'users']);
    });
    it('preserves the puzzle marker without an icon or when loading fails', async () => {
        await render();
        expect(document.querySelector('svg.lucide-puzzle')).not.toBeNull();
        expect(load).not.toHaveBeenCalled();
        load.mockRejectedValue(new Error('chunk unavailable'));
        await render('users');
        expect(document.querySelector('svg.lucide-puzzle')).not.toBeNull();
    });
    it('renders the registered icon while unknown names safely use the default', async () => {
        load.mockResolvedValueOnce(Users).mockResolvedValueOnce(null);
        await render('users');
        expect(document.querySelector('svg.lucide-users')?.getAttribute('width')).toBe('16');
        await render('unknown');
        expect(document.querySelector('svg.lucide-users')).toBeNull();
        expect(document.querySelector('svg.lucide-puzzle')).not.toBeNull();
    });
    it('ignores late loads after a registration changes its icon', async () => {
        let resolve!: (icon: LucideIcon) => void;
        load.mockReturnValueOnce(new Promise<LucideIcon>(done => { resolve = done; }))
            .mockResolvedValueOnce(Heart);
        await render('users');
        await render('heart');
        await act(async () => { resolve(Users); });
        expect(document.querySelector('svg.lucide-heart')).not.toBeNull();
        expect(document.querySelector('svg.lucide-users')).toBeNull();
    });
});

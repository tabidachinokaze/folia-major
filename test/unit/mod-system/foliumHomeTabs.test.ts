// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeTabsRegistry, selectFoliumHomeTab, useFoliumHomeTabStore } from '@/mods/folium/registries/homeTabs';
import { createFoliumClientApi, listFoliumHostRegistries } from '@/mods/folium/api';
import { createFoliumUiService, registerFoliumHostActions, type FoliumHostActions } from '@/mods/folium/services';
import type { ModRuntimeInfo } from '@/mods/types';

// test/unit/mod-system/foliumHomeTabs.test.ts
// Registration ownership, selection cleanup, and the client/export service boundary.

vi.hoisted(() => {
    const items = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, String(value)); },
        removeItem: (key: string) => { items.delete(key); }, clear: () => items.clear(),
    } });
});

const mod = { id: 'home-test', permissions: [], experimental: [] } as unknown as ModRuntimeInfo;
const definition = { id: 'messages', label: { en: 'Messages' }, mount: () => () => {} };

afterEach(() => {
    listFoliumHostRegistries().forEach(registry => { registry.unregisterAll('home-test'); registry.unregisterAll('other'); });
    registerFoliumHostActions(null);
});

describe('owned home tabs', () => {
    it('validates presentation and snapshots labels rather than keeping mutable definitions', () => {
        expect(() => homeTabsRegistry.register('home-test', { ...definition, mount: null as never })).toThrow('mount');
        expect(() => homeTabsRegistry.register('home-test', { ...definition, label: 'text' as never })).toThrow('label');
        expect(() => homeTabsRegistry.register('home-test', { ...definition, order: NaN })).toThrow('finite');
        const def = { ...definition, label: { en: 'Messages' } };
        const handle = homeTabsRegistry.register('home-test', def);
        def.label.en = 'Mutated';
        expect(homeTabsRegistry.get(handle.id)?.def.label.en).toBe('Messages');
    });

    it('only selects registered pages and falls back when their owner is removed', () => {
        homeTabsRegistry.register('home-test', definition);
        homeTabsRegistry.register('other', definition);
        expect(selectFoliumHomeTab('missing:messages')).toBe(false);
        expect(selectFoliumHomeTab('home-test:messages')).toBe(true);
        homeTabsRegistry.unregisterAll('other');
        expect(useFoliumHomeTabStore.getState().activeId).toBe('home-test:messages');
        homeTabsRegistry.unregisterAll('home-test');
        expect(useFoliumHomeTabStore.getState().activeId).toBeNull();
    });

    it('a stale handle cannot remove or deselect a re-enabled page', () => {
        const previous = homeTabsRegistry.register('home-test', definition);
        homeTabsRegistry.unregisterAll('home-test');
        homeTabsRegistry.register('home-test', definition);
        selectFoliumHomeTab('home-test:messages');
        previous.unregister();
        expect(homeTabsRegistry.list()).toHaveLength(1);
        expect(useFoliumHomeTabStore.getState().activeId).toBe('home-test:messages');
    });

    it('exposes the registry in the main API and makes it inert in an export context', () => {
        const exported = createFoliumClientApi(mod, { context: 'export', internals: null });
        exported.registries.homeTabs.register(definition);
        expect(homeTabsRegistry.list()).toHaveLength(0);
        const client = createFoliumClientApi(mod, { context: 'main', internals: null });
        expect(client.registries.homeTabs.register(definition).id).toBe('home-test:messages');
    });

    it('openHomeTab names only its owner, validates before navigation, and selects after navigation', () => {
        const navigate = vi.fn(() => useFoliumHomeTabStore.setState({ activeId: null }));
        registerFoliumHostActions({ navigate } as unknown as FoliumHostActions);
        const ui = createFoliumUiService(mod, 'main');
        homeTabsRegistry.register('other', definition);
        expect(() => ui.openHomeTab('messages')).toThrow('not-registered');
        expect(navigate).not.toHaveBeenCalled();
        homeTabsRegistry.register('home-test', definition);
        ui.openHomeTab('messages');
        expect(navigate).toHaveBeenCalledWith('home');
        expect(useFoliumHomeTabStore.getState().activeId).toBe('home-test:messages');
        expect(() => createFoliumUiService(mod, 'export').openHomeTab('messages')).toThrow('unavailable');
    });
});

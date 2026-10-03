// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { neteaseApi } from '@/services/netease';
import { omni } from '@/services/onlineMusic/omni';
import { createFoliumCatalogNavigation } from '@/mods/folium/catalogNavigation';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';

// test/unit/mod-system/foliumNeteaseAlbumNavigation.test.ts
vi.hoisted(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
    } });
});
vi.mock('@/services/netease', () => ({
    isSongMarkedUnavailable: () => false,
    neteaseApi: { getAlbum: vi.fn(), getPlaylistTracks: vi.fn() },
}));

describe('NetEase album shares through the native Folium catalog flow', () => {
    it('opens a real-shaped album and routes its songs back through the album catalog', async () => {
        // The public /album response includes a release format called "type".
        // It is not Omni's collection kind: a fixture without it hid this regression.
        vi.mocked(neteaseApi.getAlbum).mockResolvedValue({
            code: 200,
            album: { id: 32311, name: '神的游戏', type: '专辑', size: 9 },
            songs: [{ id: 42, name: 'Song', ar: [], al: { id: 32311, name: '神的游戏' }, dt: 1000 }],
        } as any);
        useAppViewStore.setState({ view: 'home' });
        useSearchNavigationStore.setState({ homeModTab: 'party:private', isSearchOpen: false });
        const navigate = vi.fn();
        const service = createFoliumCatalogNavigation(navigate);
        await expect(service.openAlbum('netease', '32311')).resolves.toBe(true);
        expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
            source: 'online', providerId: 'netease', id: 32311, type: 'album', name: '神的游戏',
        }), 'home');
        const collection = navigate.mock.calls[0][0];
        await expect(omni.getCollectionTracks(collection, { limit: 50, offset: 0 })).resolves.toMatchObject({
            items: [{ id: 42, name: 'Song' }],
        });
        expect(neteaseApi.getAlbum).toHaveBeenCalledTimes(2);
        expect(neteaseApi.getPlaylistTracks).not.toHaveBeenCalled();
        service.dispose();
    });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { omni } from '@/services/onlineMusic/omni';
import { createFoliumCatalogNavigation } from '@/mods/folium/catalogNavigation';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '@/stores/useCollectionNavigationStore';
import type { OmniCollection } from '@/types/onlineMusic';

// test/unit/mod-system/foliumCatalogNavigation.test.ts
vi.hoisted(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
    } });
});
vi.mock('@/services/onlineMusic/omni', () => ({ omni: {
    getProviderSummaries: vi.fn(), getProviderCapabilities: vi.fn(),
    getActiveRequestGeneration: vi.fn(() => 0), getAlbumDetail: vi.fn(),
} }));

const album = (id = 'album-mid'): OmniCollection => ({
    providerId: 'provider-a', id, type: 'album', name: 'Album title',
    coverUrl: 'https://example.test/cover.jpg', trackCount: 12,
    artists: [{ id: 'artist-mid', name: 'Artist' }],
});

beforeEach(() => {
    vi.clearAllMocks();
    useAppViewStore.setState({ view: 'home' });
    useSearchNavigationStore.setState({ homeModTab: 'mod-a:messages', isSearchOpen: false });
    useCollectionNavigationStore.getState().clear();
    vi.mocked(omni.getProviderSummaries).mockReturnValue([
        { providerId: 'provider-a', availability: { configured: true } },
    ] as never);
    vi.mocked(omni.getProviderCapabilities).mockReturnValue({ albums: true } as never);
    vi.mocked(omni.getAlbumDetail).mockResolvedValue(album());
});

describe('Folium native album navigation', () => {
    it('routes an explicit provider through Omni and preserves its catalog identity and metadata', async () => {
        const navigate = vi.fn();
        const service = createFoliumCatalogNavigation(navigate);
        await expect(service.openAlbum('provider-a', 'album-mid')).resolves.toBe(true);
        expect(omni.getAlbumDetail).toHaveBeenCalledWith({
            providerId: 'provider-a', id: 'album-mid', type: 'album', name: '',
        });
        expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
            ...album(), source: 'online',
        }), 'home');
        // The mod surface remains the return destination under the native collection overlay.
        expect(useSearchNavigationStore.getState().homeModTab).toBe('mod-a:messages');
    });

    it.each(['player', 'search'] as const)('uses the native %s return destination', async origin => {
        useAppViewStore.setState({ view: origin === 'player' ? 'player' : 'home' });
        useSearchNavigationStore.setState({ isSearchOpen: origin === 'search' });
        const navigate = vi.fn();
        await createFoliumCatalogNavigation(navigate).openAlbum('provider-a', 'album-mid');
        expect(navigate).toHaveBeenCalledWith(expect.anything(), origin);
    });

    it('does not request unknown, unconfigured, or unsupported providers', async () => {
        const navigate = vi.fn();
        const service = createFoliumCatalogNavigation(navigate);
        await expect(service.openAlbum('unknown', 'album-mid')).resolves.toBe(false);
        vi.mocked(omni.getProviderSummaries).mockReturnValue([
            { providerId: 'provider-a', availability: { configured: false } },
        ] as never);
        await expect(service.openAlbum('provider-a', 'album-mid')).resolves.toBe(false);
        vi.mocked(omni.getProviderSummaries).mockReturnValue([
            { providerId: 'provider-a', availability: { configured: true } },
        ] as never);
        vi.mocked(omni.getProviderCapabilities).mockReturnValue({ albums: false } as never);
        await expect(service.openAlbum('provider-a', 'album-mid')).resolves.toBe(false);
        expect(omni.getAlbumDetail).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it.each([null, { ...album(), name: '' }, { ...album(), providerId: 'provider-b' }])(
        'does not navigate when the album is unavailable or belongs to another provider', async result => {
            vi.mocked(omni.getAlbumDetail).mockResolvedValue(result);
            const navigate = vi.fn();
            await expect(createFoliumCatalogNavigation(navigate).openAlbum('provider-a', 'album-mid')).resolves.toBe(false);
            expect(navigate).not.toHaveBeenCalled();
        },
    );

    it('does not let an older album lookup replace a later navigation', async () => {
        let finish!: (value: OmniCollection) => void;
        vi.mocked(omni.getAlbumDetail).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const navigate = vi.fn();
        const service = createFoliumCatalogNavigation(navigate);
        const previous = service.openAlbum('provider-a', 'older');
        await expect(service.openAlbum('provider-a', 'album-mid')).resolves.toBe(true);
        finish(album('older'));
        await expect(previous).resolves.toBe(false);
        expect(navigate).toHaveBeenCalledTimes(1);
    });

    it.each(['home-tab', 'history', 'dispose'] as const)('ignores a late lookup after %s changes', async action => {
        let finish!: (value: OmniCollection) => void;
        vi.mocked(omni.getAlbumDetail).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const navigate = vi.fn();
        const service = createFoliumCatalogNavigation(navigate);
        const pending = service.openAlbum('provider-a', 'album-mid');
        if (action === 'home-tab') useSearchNavigationStore.getState().setHomeModTab(null);
        if (action === 'history') window.history.pushState({ elsewhere: true }, '', '#elsewhere');
        if (action === 'dispose') service.dispose();
        finish(album());
        await expect(pending).resolves.toBe(false);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('preserves provider failures for the caller to report', async () => {
        vi.mocked(omni.getAlbumDetail).mockRejectedValueOnce(new Error('network-unavailable'));
        const navigate = vi.fn();
        await expect(createFoliumCatalogNavigation(navigate).openAlbum('provider-a', 'album-mid')).rejects.toThrow('network-unavailable');
        expect(navigate).not.toHaveBeenCalled();
    });

    it('drops a provider failure after the originating navigation is disposed', async () => {
        let fail!: (reason: Error) => void;
        vi.mocked(omni.getAlbumDetail).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
        const service = createFoliumCatalogNavigation(vi.fn());
        const pending = service.openAlbum('provider-a', 'album-mid');
        service.dispose();
        fail(new Error('network-unavailable'));
        await expect(pending).resolves.toBe(false);
    });
});

import { omni } from '@/services/onlineMusic/omni';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useCollectionNavigationStore, type CollectionNavigationOrigin } from '@/stores/useCollectionNavigationStore';
import { createOnlineGridViewCollection, type GridViewCollectionDescriptor } from '@/components/app/home/gridViewCollectionAdapters';
import type { OmniCollection } from '@/types/onlineMusic';

// src/mods/folium/catalogNavigation.ts
export type FoliumCollectionNavigation = (collection: GridViewCollectionDescriptor, origin: CollectionNavigationOrigin) => void;

const readNavigation = () => {
    const search = useSearchNavigationStore.getState();
    return [
        useAppViewStore.getState().view,
        search.homeModTab,
        search.homeViewTab,
        search.isSearchOpen,
        search.requestId,
        useCollectionNavigationStore.getState().snapshot,
        window.history.state,
        window.location.href,
        omni.getActiveRequestGeneration(),
    ];
};

// Resolve catalog metadata through Omni before handing the collection to the same
// navigation action used by native album links. Late results must not move the user
// back after they leave the originating surface or open another album.
export const createFoliumCatalogNavigation = (navigate: FoliumCollectionNavigation) => {
    let revision = 0;
    let disposed = false;
    return {
        async openAlbum(provider: string, albumId: string): Promise<boolean> {
            const request = ++revision;
            const summary = omni.getProviderSummaries().find(item => item.providerId === provider);
            if (disposed || !summary?.availability.configured || !omni.getProviderCapabilities(provider).albums) return false;
            const navigation = readNavigation();
            const isCurrent = () => !disposed && revision === request
                && readNavigation().every((value, index) => Object.is(value, navigation[index]));
            const origin = useAppViewStore.getState().view === 'player'
                ? 'player' : useSearchNavigationStore.getState().isSearchOpen ? 'search' : 'home';
            let album: OmniCollection | null;
            try {
                album = await omni.getAlbumDetail({ providerId: provider, id: albumId, type: 'album', name: '' });
            } catch (error) {
                if (!isCurrent()) return false;
                throw error;
            }
            if (!isCurrent() || !album || !album.name.trim() || album.providerId !== provider || album.type !== 'album') return false;
            navigate(createOnlineGridViewCollection(album, provider), origin);
            return true;
        },
        dispose() { disposed = true; revision++; },
    };
};

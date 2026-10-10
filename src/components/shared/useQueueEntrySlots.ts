import type { SongResult } from '@/types';
import type { FoliumUiSlotItem } from '@/mods/folium/contract';
import { useUiSlots } from '@/hooks/useUiSlots';
import { toFoliumSong } from '@/mods/folium/dto';
import { readQueueView, invokeQueueViewAction, useQueueView } from '@/mods/folium/registries/queueViews';
import { getQueueSongKey } from '@/utils/appPlaybackGuards';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

// src/components/shared/useQueueEntrySlots.ts
// The same occurrence-scoped presentation feeds the panel, command palette and wall.
export function useQueueEntrySlots(song: SongResult, surface: 'panel' | 'palette' | 'lattice', defaults: FoliumUiSlotItem[] = []) {
    const view = useQueueView(), key = getQueueSongKey(song), entry = view?.entries.get(key);
    const privateCurrent = usePlaybackStore(state => state.currentSong);
    const actions = entry && view ? entry.actions.map(action => ({ ...action,
        id: `host:queue-action:${action.id}`, kind: 'button' as const,
        run: () => invokeQueueViewAction(view.owner, key, action.id),
    })) : song.queuePresentationId ? [] : defaults;
    const overline: FoliumUiSlotItem[] = entry?.overline ? [{ id: 'host:queue-overline', kind: 'text', label: entry.overline }] : [];
    return useUiSlots('queue.entry', { overline, actions }, {
        surface, entityId: key, song: toFoliumSong(song),
        values: { current: view ? view.currentSong?.queuePresentationId === key : Boolean(privateCurrent && getQueueSongKey(privateCurrent) === key) },
    });
}
export const queueViewHeaderActions = (): FoliumUiSlotItem[] => {
    const view = readQueueView();
    return view ? view.actions.map(action => ({ ...action, id: `host:queue-action:${action.id}`, kind: 'button',
        run: () => invokeQueueViewAction(view.owner, null, action.id),
    })) : [];
};

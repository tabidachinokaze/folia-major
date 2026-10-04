import type { SongResult } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { useExternalQueueStore } from './externalPlaybackQueue';
import { captureExternalFavoriteNotifier } from './externalPlaybackSession';

// src/services/externalPlaybackFavorite.ts
// Personal favourites still belong to Omni. Only their confirmed result is observed by a session.
export function captureExternalPlaybackFavorite(song: SongResult) {
    const view = useExternalQueueStore.getState().view;
    const entryKey = view?.currentSong?.externalQueueEntryKey;
    const entry = entryKey ? view?.items.get(entryKey) : undefined;
    if (!view || view.stopAction || !entry || !entryKey) return;
    const notify = captureExternalFavoriteNotifier(view.owner);
    if (!notify) return;
    const songKey = getPlaybackSongKey(song);
    const isCurrent = () => {
        const latest = useExternalQueueStore.getState().view;
        const playing = usePlaybackStore.getState().currentSong;
        const current = latest?.items.get(entryKey);
        return latest?.owner === view.owner && !latest.stopAction
            && latest.currentSong?.externalQueueEntryKey === entryKey
            && current?.id === entry.id && getPlaybackSongKey(current.song) === songKey
            && Boolean(playing && getPlaybackSongKey(playing) === songKey);
    };
    if (!isCurrent()) return;
    return (liked: boolean) => {
        if (isCurrent()) notify({ song, entryId: entry.id, liked });
    };
}

import { create } from 'zustand';
import type { SongResult } from '../types';
import type { ExternalQueueView } from '../types/externalPlayback';
import { isExternalPlaybackOwner, routeExternalPlayback } from './externalPlaybackSession';

// src/services/externalPlaybackQueue.ts
// Presentation is separate from the private playback queue and its audio/cache identity.
export const useExternalQueueStore = create<{ view: ExternalQueueView | null }>(() => ({ view: null }));
export const clearExternalQueue = (owner: symbol) => {
    if (useExternalQueueStore.getState().view?.owner === owner) useExternalQueueStore.setState({ view: null });
};
export const setExternalQueue = (view: ExternalQueueView) => {
    if (!isExternalPlaybackOwner(view.owner)) throw new Error('playback-session-released');
    useExternalQueueStore.setState({ view });
};
export function invokeExternalQueueAction(entryKey: string | null, actionId: string) {
    const view = useExternalQueueStore.getState().view;
    if (!view || !isExternalPlaybackOwner(view.owner)) return false;
    const item = entryKey ? view.items.get(entryKey) : null;
    if (entryKey && !item) return false;
    const action = !entryKey && view.stopAction?.id === actionId ? view.stopAction
        : (item?.actions ?? view.actions).find(candidate => candidate.id === actionId);
    if (!action || action.disabled) return false;
    return routeExternalPlayback({ type: 'queue-action', entryId: item?.id ?? null, actionId });
}
export function activateExternalQueueSong(song: SongResult) {
    const key = song.externalQueueEntryKey;
    if (!key) return false;
    const item = useExternalQueueStore.getState().view?.items.get(key);
    if (item?.defaultAction) invokeExternalQueueAction(key, item.defaultAction);
    // Even an expired occurrence must not fall through to local playback or recommendation.
    return true;
}
export function syncExternalQueue() {
    const view = useExternalQueueStore.getState().view;
    return view?.syncActionId ? invokeExternalQueueAction(null, view.syncActionId) : false;
}

/** User transport only. Internal pauses used to load a session source must remain literal pauses. */
export function stopExternalPlayback() {
    const view = useExternalQueueStore.getState().view;
    if (!view?.stopAction || !isExternalPlaybackOwner(view.owner)) return false;
    invokeExternalQueueAction(null, view.stopAction.id);
    // Disabled stop also consumes the user command; it must not fall through to local pause/play.
    return true;
}

import { useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useExternalQueueStore } from '../services/externalPlaybackQueue';
import { hasExternalPlayback, subscribeExternalPlayback } from '../services/externalPlaybackSession';

// src/hooks/useExternalQueuePresentation.ts
// Counts/actions subscribe in their own components; votes don't rebuild the poster wall's queue.
export function useExternalQueuePresentation() {
    const active = useSyncExternalStore(subscribeExternalPlayback, hasExternalPlayback, () => false);
    const data = useExternalQueueStore(useShallow(state => ({
        queue: state.view?.queue,
        currentSong: state.view?.currentSong,
        canPrevious: state.view?.canPrevious ?? false,
        canNext: state.view?.canNext ?? true,
    })));
    return { active, ...data };
}

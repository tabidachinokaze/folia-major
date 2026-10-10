import { useEffect, useRef } from 'react';
import { selectDisplaySong, usePlaybackStore } from '@/stores/usePlaybackStore';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';
import { createRemoteControlActionBridge, type RemoteActionSource } from '@/services/remoteControlActions';
import type { RemoteActionActivation } from '@/types/remoteControl';
import { useStableCallbacks } from './useStableCallbacks';

// src/hooks/useRemoteControlActions.ts
// StrictMode starts a fresh ticket epoch after teardown; callbacks never cross renderer lifetimes.
export function useRemoteControlActions(readSource: () => RemoteActionSource) {
    const latest = useStableCallbacks({ readSource });
    const bridge = useRef<ReturnType<typeof createRemoteControlActionBridge> | null>(null);
    useEffect(() => {
        const instance = createRemoteControlActionBridge(latest.readSource, () => {
            const song = selectDisplaySong(usePlaybackStore.getState());
            return song ? getPlaybackSongKey(song) : null;
        });
        bridge.current = instance;
        return () => { instance.dispose(); if (bridge.current === instance) bridge.current = null; };
    }, [latest.readSource]);
    return useStableCallbacks({
        read: () => bridge.current?.read(),
        activate: (command: RemoteActionActivation) => bridge.current?.activate(command) ?? Promise.resolve(false),
    });
}

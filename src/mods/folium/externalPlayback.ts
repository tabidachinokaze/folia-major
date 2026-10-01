import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';
import { createExternalQueueAdapter } from './externalQueueAdapter';
import { clearExternalQueue, setExternalQueue } from '@/services/externalPlaybackQueue';
import { omni } from '@/services/onlineMusic/omni';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { currentTime } from '@/stores/motionSignals';
import { PlayerState, type SongResult } from '@/types';
import type { PlaybackRequest } from '@/types/externalPlayback';
import { beginPlaybackRequest, invalidatePlaybackRequest } from '@/services/playbackRequest';
import {
    acquireExternalPlayback,
    isExternalPlaybackOwner,
    releaseExternalPlayback,
    releaseExternalPlaybackForMod,
    releaseAllExternalPlayback,
} from '@/services/externalPlaybackSession';
import type { ModRuntimeInfo } from '../types';
import type { FoliumPlaybackSession, FoliumPlaybackSessions, FoliumPlaybackSessionIntent } from './contract';
import { resolveFoliumSongRef, toFoliumSong } from './dto';
import { reportFoliumIssue } from './status';
import { registerFoliumServiceDisposer } from './lifecycle';

// src/mods/folium/externalPlayback.ts
interface Actions {
    play(song: SongResult, request: PlaybackRequest): Promise<void> | void;
    stop(): void;
    canAcquire?(): boolean;
    seek(seconds: number): void;
}
let actions: Actions | null = null;
export const registerExternalPlaybackActions = (value: Actions | null) => {
    if (!value) releaseAllExternalPlayback();
    actions = value;
};

export function createFoliumPlaybackSessions(mod: ModRuntimeInfo): FoliumPlaybackSessions {
    let active = true;
    const requireAccess = () => {
        if (!active) throw new Error('mod-service-disposed');
        if (!mod.experimental?.includes('playback.sessions'))
            throw new Error('experimental-not-declared:playback.sessions');
        if (!mod.permissions.includes('playback.control')) throw new Error('permission-denied:playback.control');
    };
    registerFoliumServiceDisposer(mod.id, () => {
        active = false;
        releaseExternalPlaybackForMod(mod.id);
    });
    return Object.freeze<FoliumPlaybackSessions>({
        version: 2,
        supportsHandoff: true,
        async resolveSong(provider, id) {
            requireAccess();
            if (typeof provider !== 'string' || !provider || typeof id !== 'string' || !id || id.length > 2048)
                throw new Error('invalid-song-reference');
            const song = await omni.getSongDetail(provider, id);
            requireAccess();
            if (!song) throw new Error('song-unavailable');
            return toFoliumSong(song)!;
        },
        acquire({ onIntent, restore }) {
            requireAccess();
            if (restore !== 'queue-stopped' || typeof onIntent !== 'function')
                throw new Error('invalid-playback-session-options');
            if (!actions) throw new Error('playback-unavailable');
            const host = actions;
            const state = usePlaybackStore.getState();
            if (
                state.activePlaybackContext !== 'main' ||
                state.transitionDisplay ||
                state.isFmMode ||
                host.canAcquire?.() === false
            ) {
                throw new Error('external-playback-context-unavailable');
            }
            const queue = [...state.playQueue];
            let handoff = false;
            const report = (error: unknown) => reportFoliumIssue(mod.id, 'playback session', error);
            const token = acquireExternalPlayback({
                modId: mod.id,
                report,
                dispatch: (intent) => {
                    const dto: FoliumPlaybackSessionIntent =
                        intent.type === 'play'
                            ? { type: 'play', song: toFoliumSong(intent.song)! }
                            : intent.type === 'enqueue'
                              ? { type: 'enqueue', songs: intent.songs.map((song) => toFoliumSong(song)!) }
                              : intent;
                    return onIntent(dto);
                },
                cleanup: () => {
                    clearExternalQueue(token);
                    const current = usePlaybackStore.getState();
                    if (handoff && current.currentSong && current.audioSrc) {
                        const song = current.currentSong;
                        const restored = queue.some(item => getPlaybackSongKey(item) === getPlaybackSongKey(song)) ? queue : [song, ...queue];
                        usePlaybackStore.setState({ playQueue: restored });
                        return;
                    }
                    try {
                        host.stop();
                    } finally {
                        usePlaybackStore.setState({
                            playQueue: queue,
                            currentSong: null,
                            audioSrc: null,
                            lyrics: null,
                            activeLocalLyricsSource: null,
                            cachedCoverUrl: null,
                            duration: 0,
                            playerState: PlayerState.IDLE,
                            currentLineIndex: -1,
                            isFmMode: false,
                        });
                        currentTime.set(0);
                    }
                },
            });
            try {
                host.stop();
                state.setPlayQueue([]);
            } catch (error) {
                releaseExternalPlayback(token);
                throw error;
            }
            const adaptQueue = createExternalQueueAdapter(token);
            return Object.freeze<FoliumPlaybackSession>({
                setQueue(queue) {
                    requireAccess();
                    if (!isExternalPlaybackOwner(token)) throw new Error('playback-session-released');
                    setExternalQueue(adaptQueue(queue));
                },
                stop() {
                    requireAccess();
                    if (!isExternalPlaybackOwner(token)) throw new Error('playback-session-released');
                    invalidatePlaybackRequest();
                    host.stop();
                    usePlaybackStore.setState({ currentSong: null, audioSrc: null, lyrics: null, activeLocalLyricsSource: null,
                        cachedCoverUrl: null, duration: 0, playerState: PlayerState.IDLE, currentLineIndex: -1 });
                    currentTime.set(0);
                },
                play(song) {
                    if (!active || !isExternalPlaybackOwner(token))
                        return Promise.resolve({ status: 'cancelled' as const });
                    const resolved = resolveFoliumSongRef(song.ref);
                    if (!resolved) return Promise.resolve({ status: 'unavailable' as const });
                    const request = beginPlaybackRequest(token);
                    try {
                        Promise.resolve(host.play(resolved, request))
                            .catch((error) => {
                                if (request.isCurrent()) {
                                    report(error);
                                    request.finish('failed');
                                }
                            })
                            .finally(() => request.finish('cancelled'));
                    } catch (error) {
                        report(error);
                        request.finish('failed');
                    }
                    return request.result;
                },
                seek(seconds) {
                    requireAccess();
                    if (!isExternalPlaybackOwner(token)) throw new Error('playback-session-released');
                    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('invalid-playback-position');
                    host.seek(seconds);
                },
                handoff() {
                    if (!isExternalPlaybackOwner(token)) return;
                    requireAccess();
                    handoff = true;
                    releaseExternalPlayback(token);
                },
                release: () => releaseExternalPlayback(token),
            });
        },
    });
}

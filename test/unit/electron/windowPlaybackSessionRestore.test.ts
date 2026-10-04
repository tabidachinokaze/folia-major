// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    } });
});
vi.mock('@/components/app/playback/restorePlaybackSource', () => ({ restorePlaybackSourceForSong: vi.fn() }));
vi.mock('@/services/hostExtensionHooks', () => ({ untransformedLyrics: (value: unknown) => value }));
import { restorePlaybackSourceForSong } from '@/components/app/playback/restorePlaybackSource';
import { useElectronWindowPlaybackHandoff } from '@/hooks/useElectronWindowPlaybackHandoff';
import { onPlaybackWindowResume } from '@/services/externalPlaybackWindowResume';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { PlayerState, type SongResult } from '@/types';

// test/unit/electron/windowPlaybackSessionRestore.test.ts
let root: Root | undefined, stop: (() => void) | undefined;
const initial = usePlaybackStore.getState();
const roomSong = { id: 'room-song', name: 'Room song', artists: [], album: { id: 'album', name: '' },
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'room-song' } } as unknown as SongResult;
function Probe() {
    useElectronWindowPlaybackHandoff({
        isElectronWindow: true, navigateToPlayer: vi.fn(), audioRef: { current: null },
        mainPlaybackSnapshotRef: { current: null }, stageStatus: null, stageSource: null,
        stageLyricsClockRef: { current: {} }, nowPlayingTrack: null, nowPlayingLyricPayload: null,
        nowPlayingPaused: true, nowPlayingProgressMs: 0, nowPlayingProgressQuality: 'precise',
        getNowPlayingDisplayTime: () => 0, restoreStagePlaybackHandoff: vi.fn(), setLyrics: vi.fn(),
        setIsLyricsLoading: vi.fn(), blobUrlRef: { current: null }, shouldAutoPlayRef: { current: false },
        pendingResumeTimeRef: { current: null }, lastAudioRecoverySourceRef: { current: null },
        currentOnlineAudioUrlFetchedAtRef: { current: null }, applyTransparentPlayerBackground: vi.fn(),
        restoreCachedThemeForSong: vi.fn(), persistLastPlaybackCache: vi.fn(),
    } as any);
    return null;
}
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    usePlaybackStore.setState(initial, true);
    vi.clearAllMocks();
});
afterEach(() => {
    act(() => root?.unmount()); root = undefined; stop?.(); stop = undefined;
    delete window.electron;
});

describe('window handoff before session continuation', () => {
    it.each([{ queue: [] as SongResult[] }, { queue: [roomSong] }])('restores the exact private queue before offering the owner continuation ($queue)', async ({ queue }) => {
        let finish!: () => void;
        vi.mocked(restorePlaybackSourceForSong).mockImplementation(() => new Promise(resolve => {
            finish = () => {
                // Ordinary source hydration is allowed to insert/update its playing track.
                usePlaybackStore.setState({ playQueue: [roomSong], audioSrc: 'restored-source' });
                resolve(true);
            };
        }));
        const snapshot = { currentSong: roomSong, playQueue: queue, lyrics: null, cachedCoverUrl: null,
            audioSrc: 'old-source', playerState: PlayerState.PAUSED, currentTime: 12, duration: 100,
            isFmMode: false, currentLineIndex: -1 };
        const resume = vi.fn(() => {
            expect(usePlaybackStore.getState()).toMatchObject({ playQueue: queue, audioSrc: 'restored-source' });
        });
        stop = onPlaybackWindowResume('room', resume, error => { throw error; });
        window.electron = { consumeWindowPlaybackHandoff: vi.fn(async () => ({ version: 1,
            activePlaybackContext: 'main', mainPlayback: snapshot, activePlayback: snapshot,
            ui: { playerChromeHidden: false, mainWindowBorderVisible: false, currentView: 'player' },
            externalPlayback: { id: crypto.randomUUID(), modId: 'room', state: { uid: '9', roomId: 'official' },
                expiresAt: Date.now() + 60000, queue },
        })) } as any;
        root = createRoot(document.createElement('div'));
        await act(async () => { root!.render(React.createElement(Probe)); });
        expect(resume).not.toHaveBeenCalled();
        await act(async () => { finish(); });
        expect(resume).toHaveBeenCalledOnce();
    });
});

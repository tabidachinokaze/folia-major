// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.hoisted(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, String(value)),
            removeItem: (key: string) => values.delete(key),
            clear: () => values.clear(),
        },
    });
});
vi.mock('@/services/localMusicService', async (original) => ({
    ...(await original<typeof import('@/services/localMusicService')>()),
    getAudioFromLocalSong: vi.fn(),
}));
vi.mock('@/services/db', async (original) => ({
    ...(await original<typeof import('@/services/db')>()),
    getFromCacheWithMigration: vi.fn(),
}));
vi.mock('@/services/navidromeService', async (original) => {
    const actual = await original<typeof import('@/services/navidromeService')>();
    return {
        ...actual,
        getNavidromeConfig: () => ({ server: 'https://example.invalid', username: 'test' }),
        navidromeApi: {
            ...actual.navidromeApi,
            getStreamUrl: () => 'https://example.invalid/song',
            getSong: async () => ({}),
        },
    };
});
vi.mock('@/utils/keyboardTargets', async (original) => ({
    ...(await original<typeof import('@/utils/keyboardTargets')>()),
    hasBlockingWindow: () => false,
    isTextEntryTarget: () => false,
}));
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { acquireExternalPlayback, releaseAllExternalPlayback } from '@/services/externalPlaybackSession';
import { invalidatePlaybackRequest } from '@/services/playbackRequest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { currentTime } from '@/stores/motionSignals';
import { useLibraryPlaybackController } from '@/hooks/useLibraryPlaybackController';
import { usePlaybackInteractionBridge } from '@/hooks/usePlaybackInteractionBridge';
import { usePlaybackQueueController } from '@/hooks/usePlaybackQueueController';
import { useMediaSessionBridge } from '@/hooks/useMediaSessionBridge';
import { setExternalQueue, useExternalQueueStore } from '@/services/externalPlaybackQueue';
import { createExternalQueueAdapter } from '@/mods/folium/externalQueueAdapter';
import { getAudioFromLocalSong } from '@/services/localMusicService';
import { getFromCacheWithMigration } from '@/services/db';
import { createQueueMutations } from '@/components/app/player-panel/createQueueMutations';
import { createSessionTransport } from '@/components/app/playback/createSessionTransport';
import { buildAppOverlaysModel } from '@/components/app/overlays/buildAppOverlaysModel';
import { omni } from '@/services/onlineMusic/omni';
import { PlayerState, type LocalSong, type SongResult } from '@/types';
import type { NavidromeSong } from '@/types/navidrome';

// test/unit/mod-system/externalPlaybackRouting.test.ts
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const initial = usePlaybackStore.getState();
const ref = <T>(value: T) => ({ current: value });
let root: Root | undefined;
const own = (dispatch = vi.fn()) =>
    acquireExternalPlayback({ modId: 'test', dispatch, cleanup: vi.fn(), report: vi.fn() });
const song = { id: 99, name: 'Room', artists: [], album: { id: 1, name: '' }, durationMs: 100000 } as SongResult;
function mount(component: React.FC) {
    const box = document.createElement('div');
    document.body.append(box);
    root = createRoot(box);
    act(() => {
        root!.render(React.createElement(component));
    });
}
const params = () => ({
    likedSongIds: new Set<number>(),
    setLyrics: vi.fn(),
    setIsLyricsLoading: vi.fn(),
    setLikedSongIds: vi.fn(),
    navigateToPlaybackView: vi.fn(),
    persistLastPlaybackCache: vi.fn(async () => {}),
    restoreCachedThemeForSong: vi.fn(async () => {}),
    interruptStagePlaybackForMainTransition: () => null,
    blobUrlRef: ref<string | null>(null),
    shouldAutoPlayRef: ref(false),
    currentSongRef: ref<string | number | null>(null),
    currentOnlineAudioUrlFetchedAtRef: ref<number | null>(null),
});
beforeEach(() => {
    vi.clearAllMocks();
    usePlaybackStore.setState(initial, true);
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
    act(() => {
        root?.unmount();
    });
    root = undefined;
    releaseAllExternalPlayback();
    useExternalQueueStore.setState({ view: null });
    invalidatePlaybackRequest();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

it.each([true, false])('only notifies after the personal favourite request and UI state succeed (%s)', async liked => {
    const input = params();
    const favoriteChanged = vi.fn(() => expect(input.setLikedSongIds).toHaveBeenCalledOnce());
    const owner = acquireExternalPlayback({ modId: 'test', dispatch: vi.fn(), cleanup: vi.fn(), report: vi.fn(), favoriteChanged });
    setExternalQueue(createExternalQueueAdapter(owner)({ entries: [{ id: 'now', track: { id: '99', source: 'netease', title: 'Room', artist: '' }, actions: [] }],
        currentId: 'now', canNext: true }));
    usePlaybackStore.setState({ currentSong: song, audioSrc: 'room-source' });
    vi.spyOn(omni, 'canLikeSong').mockReturnValue(true);
    let complete!: (value: boolean) => void;
    const personal = vi.spyOn(omni, 'toggleSongLike').mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    let library!: ReturnType<typeof useLibraryPlaybackController>;
    mount(() => { library = useLibraryPlaybackController(input); return null; });
    let pending!: Promise<void>;
    act(() => { pending = library.handleLike(); });
    expect(favoriteChanged).not.toHaveBeenCalled();
    await act(async () => { complete(liked); await pending; });
    expect(personal).toHaveBeenCalledExactlyOnceWith(song, input.likedSongIds);
    expect(favoriteChanged).toHaveBeenCalledExactlyOnceWith({ song, entryId: 'now', liked });
    const update = input.setLikedSongIds.mock.calls[0][0];
    expect(update(new Set([99])).has('99')).toBe(liked);
});

it('never notifies the session or changes liked state when the personal favourite request fails', async () => {
    const input = params(), favoriteChanged = vi.fn();
    const owner = acquireExternalPlayback({ modId: 'test', dispatch: vi.fn(), cleanup: vi.fn(), report: vi.fn(), favoriteChanged });
    setExternalQueue(createExternalQueueAdapter(owner)({ entries: [{ id: 'now', track: { id: '99', source: 'netease', title: 'Room', artist: '' }, actions: [] }],
        currentId: 'now', canNext: true }));
    usePlaybackStore.setState({ currentSong: song, audioSrc: 'room-source' });
    vi.spyOn(omni, 'canLikeSong').mockReturnValue(true);
    vi.spyOn(omni, 'toggleSongLike').mockRejectedValueOnce(new Error('Personal favourite rejected'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let library!: ReturnType<typeof useLibraryPlaybackController>;
    mount(() => { library = useLibraryPlaybackController(input); return null; });
    await act(async () => { await library.handleLike(); });
    expect(favoriteChanged).not.toHaveBeenCalled();
    expect(input.setLikedSongIds).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().audioSrc).toBe('room-source');
});

it('routes arrow-key seek with pause-preserving semantics instead of changing the element', () => {
    const dispatch = vi.fn();
    own(dispatch);
    usePlaybackStore.setState({
        currentSong: song,
        audioSrc: 'room-source',
        playerState: PlayerState.PAUSED,
        duration: 100,
    });
    useAppViewStore.setState({ view: 'player', isPanelOpen: false });
    currentTime.set(10);
    const audio = { currentTime: 10 } as HTMLAudioElement;
    mount(() => {
        usePlaybackInteractionBridge({
            stageActiveEntryKind: null,
            isNowPlayingStageActive: false,
            audioRef: ref(audio),
            stageLyricsClockRef: ref({ startTimeSec: 0, endTimeSec: 0, baseTimeSec: 0, startedAtMs: null }),
            cyclePlayerChromeVisibilityMode: vi.fn(),
            handleNextTrack: vi.fn(),
            handlePrevTrack: vi.fn(),
            navigateBackFromPlayer: vi.fn(),
            pausePlayback: vi.fn(),
            resumePlayback: vi.fn(async () => {}),
            syncStageLyricsClock: vi.fn(),
        });
        return null;
    });
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    });
    expect(audio.currentTime).toBe(10);
    expect(dispatch).toHaveBeenCalledWith({ type: 'seek', seconds: 15, resume: false });
});

it.each([true, false])('uses session navigation capabilities instead of the one-track audio queue (previous: %s)', canPrevious => {
    const onPrevious = vi.fn();
    const model = buildAppOverlaysModel({
        currentView: 'player', currentSong: song, playQueue: [song],
        effectiveLoopMode: 'off', isFmMode: false, isNowPlayingStageActive: false,
        isNowPlayingControlDisabled: false, handlePrevTrack: onPrevious,
        externalCanPrevious: canPrevious, externalCanNext: true,
    } as unknown as Parameters<typeof buildAppOverlaysModel>[0]);
    const navigation = model.floatingControls!.trackNavigation!;
    expect(navigation.canPrev).toBe(canPrevious);
    expect(navigation.canNext).toBe(true);
    if (canPrevious) {
        navigation.onPrev();
        expect(onPrevious).toHaveBeenCalledOnce();
    }
});

it('drops local audio arriving after acquisition and revokes its uncommitted blob', async () => {
    const input = params();
    let library!: ReturnType<typeof useLibraryPlaybackController>;
    mount(() => {
        library = useLibraryPlaybackController(input);
        return null;
    });
    let resolve!: (value: string) => void;
    vi.mocked(getAudioFromLocalSong).mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        }),
    );
    let pending!: Promise<void>;
    act(() => {
        pending = library.onPlayLocalSong({ id: 'local' } as LocalSong);
    });
    own();
    act(() => {
        usePlaybackStore.setState({ currentSong: song, audioSrc: 'room-source' });
    });
    await act(async () => {
        resolve('blob:old-local');
        await pending;
    });
    expect(usePlaybackStore.getState().audioSrc).toBe('room-source');
    expect(input.shouldAutoPlayRef.current).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-local');
    expect(input.persistLastPlaybackCache).not.toHaveBeenCalled();
});

it('drops a Navidrome load after acquisition even when its cached lyrics arrive later', async () => {
    const input = params();
    let library!: ReturnType<typeof useLibraryPlaybackController>;
    mount(() => {
        library = useLibraryPlaybackController(input);
        return null;
    });
    let resolve!: (value: unknown) => void;
    vi.mocked(getFromCacheWithMigration).mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        }),
    );
    let pending!: Promise<void>;
    act(() => {
        pending = library.onPlayNavidromeSong({
            id: 'nav',
            name: 'Nav',
            isNavidrome: true,
            navidromeData: {
                id: 'nav',
                streamUrl: 'https://example.invalid/song',
                albumId: 'a',
                artistId: 'r',
                path: '/song.mp3',
                suffix: 'mp3',
            },
        } as NavidromeSong);
    });
    own();
    act(() => {
        usePlaybackStore.setState({ currentSong: song, audioSrc: 'room-source' });
    });
    await act(async () => {
        resolve({ lyricsSource: 'online', matchedLyrics: { lines: [] } });
        await pending;
    });
    expect(usePlaybackStore.getState().audioSrc).toBe('room-source');
    expect(input.shouldAutoPlayRef.current).toBe(false);
    expect(input.persistLastPlaybackCache).not.toHaveBeenCalled();
});

it('routes bulk Navidrome enqueue and blocks personal queue edits while owned', () => {
    const dispatch = vi.fn();
    own(dispatch);
    usePlaybackStore.setState({ playQueue: [song] });
    const persist = vi.fn(async () => {});
    const mutations = createQueueMutations({
        currentSong: song,
        playQueue: [song],
        persistLastPlaybackCache: persist,
        t: (key) => key,
        queueAddBehavior: 'append',
    });
    mutations.addNavidromeSongsToQueue([
        {
            id: 'nav',
            name: 'Nav',
            isNavidrome: true,
            artists: [],
            album: { id: 'a', name: '' },
            durationMs: 1000,
            navidromeData: {
                id: 'nav',
                streamUrl: 'https://example.invalid/song',
                albumId: 'a',
                artistId: 'r',
                path: '/song.mp3',
                suffix: 'mp3',
            },
        } as NavidromeSong,
    ]);
    expect(dispatch.mock.calls[0][0].type).toBe('enqueue');
    expect(dispatch.mock.calls[0][0].songs).toHaveLength(1);
    mutations.removeQueueSong(0);
    expect(mutations.applyQueueBatchOperation('remove', [0])).toBe(false);
    expect(usePlaybackStore.getState().playQueue).toEqual([song]);
    expect(persist).not.toHaveBeenCalled();
});

it('lease transport seek preserves pause and stop disarms autoplay even if pause throws', () => {
    const audio = {
        currentTime: 4,
        duration: 100,
        readyState: 1,
        paused: true,
        pause: vi.fn(() => {
            throw Error('pause');
        }),
        removeAttribute: vi.fn(),
        load: vi.fn(),
        play: vi.fn(),
    };
    const refs = {
        audioRef: ref(audio as unknown as HTMLAudioElement),
        shouldAutoPlay: ref(true),
        currentSongRef: ref<string | number | null>('99'),
        blobUrlRef: ref<string | null>(null),
        pendingResumeTimeRef: ref<number | null>(7),
    };
    const transport = createSessionTransport(refs);
    transport.seek(12);
    expect(audio.currentTime).toBe(12);
    expect(audio.play).not.toHaveBeenCalled();
    expect(() => transport.stop()).toThrow('pause');
    expect(refs.shouldAutoPlay.current).toBe(false);
    expect(refs.currentSongRef.current).toBeNull();
    expect(refs.pendingResumeTimeRef.current).toBeNull();
    expect(usePlaybackStore.getState().audioSrc).toBeNull();
});

it('auditions playlist/album play actions but routes add-to-queue as recommendations', async () => {
    const dispatch = vi.fn();
    acquireExternalPlayback({ modId: 'test', audition: true, dispatch, cleanup: vi.fn(), report: vi.fn() });
    const current = { ...song, sourceRef: { kind: 'online' as const, providerId: 'netease', mediaId: '99' } };
    const selected = { ...current, id: 100, sourceRef: { ...current.sourceRef, mediaId: '100' } };
    usePlaybackStore.setState({ currentSong: current, playQueue: [current], audioSrc: 'room-source' });
    const input: Parameters<typeof usePlaybackQueueController>[0] = {
        ...params(),
        isNowPlayingStageActive: false, shouldNavigateToPlayerOnTrackChange: false,
        localSongs: [], localLibraryCatalog: { entities: [], assignments: [] },
        navigateToSearch: vi.fn(), onPlayLocalSong: vi.fn(async () => {}), onPlayNavidromeSong: vi.fn(async () => {}),
        onAddLocalSongToQueue: vi.fn(), onAddNavidromeSongsToQueue: vi.fn(),
        searchDeps: { submitSearch: vi.fn(async () => false), loadMoreSearchResults: vi.fn(async () => {}) },
        audioRef: ref(null), mainPlaybackSnapshotRef: ref(null), playbackAutoSkipCountRef: ref(0),
        pendingResumeTimeRef: ref(null), lastAudioRecoverySourceRef: ref(null),
    };
    let controller!: ReturnType<typeof usePlaybackQueueController>;
    mount(() => { controller = usePlaybackQueueController(input); return null; });
    await act(async () => {
        controller.playOnlineQueueFromStart([selected, current]);
        controller.handleQueueAddAndPlay(selected);
        controller.addOnlineSongsToQueue([selected, current]);
    });
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual(['audition', 'audition', 'enqueue']);
    expect(dispatch.mock.calls[0][0]).toEqual({ type: 'audition', song: selected });
    expect(dispatch.mock.calls[2][0]).toEqual({ type: 'enqueue', songs: [selected, current] });
    expect(usePlaybackStore.getState()).toMatchObject({ currentSong: current, playQueue: [current], audioSrc: 'room-source' });
    expect(input.persistLastPlaybackCache).not.toHaveBeenCalled();
});

it('routes Space and native media pause/stop to audition Stop, while a normal room still pauses', () => {
    const dispatch = vi.fn(), token = own(dispatch), adapter = createExternalQueueAdapter(token);
    const stopAction = { id: 'stop-preview', icon: 'square' as const, label: { en: 'Stop audition' } };
    const presentation = { entries: [], currentId: null, canNext: false, stopAction };
    setExternalQueue(adapter(presentation));
    usePlaybackStore.setState({ currentSong: song, audioSrc: 'preview-source', playerState: PlayerState.PLAYING });
    useAppViewStore.setState({ view: 'player', isPanelOpen: false });
    const pause = vi.fn(), resume = vi.fn(async () => {});
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaSession');
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: {
        setActionHandler: (name: string, handler: MediaSessionActionHandler | null) => handlers.set(name, handler),
        setPositionState: vi.fn(),
    } });
    const audio = { paused: false, ended: false } as HTMLAudioElement;
    try {
        mount(() => {
            usePlaybackInteractionBridge({
                stageActiveEntryKind: null, isNowPlayingStageActive: false, audioRef: ref(audio),
                stageLyricsClockRef: ref({ startTimeSec: 0, endTimeSec: 0, baseTimeSec: 0, startedAtMs: null }),
                cyclePlayerChromeVisibilityMode: vi.fn(), handleNextTrack: vi.fn(), handlePrevTrack: vi.fn(),
                navigateBackFromPlayer: vi.fn(), pausePlayback: pause, resumePlayback: resume, syncStageLyricsClock: vi.fn(),
            });
            useMediaSessionBridge({
                audioRef: ref(audio), audioSrc: null, currentSong: null, cachedCoverUrl: null,
                playerState: PlayerState.PLAYING, isNowPlayingStageActive: false, unknownArtistLabel: '',
                mediaSessionPlayRef: ref(resume), mediaSessionPauseRef: ref(pause),
                mediaSessionPrevRef: ref(vi.fn()), mediaSessionNextRef: ref(vi.fn()), isNowPlayingControlDisabledRef: ref(false),
            });
            return null;
        });
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
            handlers.get('pause')?.({ action: 'pause' });
            handlers.get('stop')?.({ action: 'stop' });
        });
        expect(dispatch).toHaveBeenCalledTimes(3);
        expect(dispatch).toHaveBeenLastCalledWith({ type: 'queue-action', entryId: null, actionId: 'stop-preview' });
        expect(pause).not.toHaveBeenCalled();
        expect(resume).not.toHaveBeenCalled();
        act(() => setExternalQueue(adapter({ ...presentation, stopAction: undefined })));
        handlers.get('pause')?.({ action: 'pause' });
        expect(pause).toHaveBeenCalledOnce();
    } finally {
        // Unmount before restoring the host object, so cleanup removes the registered handlers.
        act(() => root?.unmount()); root = undefined;
        if (previous) Object.defineProperty(navigator, 'mediaSession', previous);
        else Reflect.deleteProperty(navigator, 'mediaSession');
    }
});

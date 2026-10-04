import { capturePlaybackWindowResume, restorePlaybackWindowResume } from '@/services/externalPlaybackWindowResume';
import { activateExternalQueueSong, invokeExternalQueueAction, stopExternalPlayback, useExternalQueueStore } from '@/services/externalPlaybackQueue';
import { getPlaybackSongKey, getQueueSongKey } from '@/utils/appPlaybackGuards';
import { buildLatticeTiles } from '@/components/app/lattice/latticeModel';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { getSongDetail: vi.fn() } }));
import { omni } from '@/services/onlineMusic/omni';
import { createFoliumPlaybackSessions, registerExternalPlaybackActions } from '@/mods/folium/externalPlayback';
import { useFoliumStatusStore, clearFoliumIssues } from '@/mods/folium/status';
import { disposeFoliumServices } from '@/mods/folium/lifecycle';
import { createFoliumClientApi } from '@/mods/folium/api';
import { createFoliumExperimental } from '@/mods/folium/experimental';
import { reconcileFoliumClients } from '@/mods/folium/clientLoader';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import {
    hasExternalPlayback,
    releaseAllExternalPlayback,
    routeExternalPlayback,
    routeExternalPlay,
} from '@/services/externalPlaybackSession';
import { toFoliumSong } from '@/mods/folium/dto';
import type { FoliumPlaybackSessionIntent } from '@/mods/folium/contract';
import type { PlaybackRequest } from '@/types/externalPlayback';
import { PlayerState, type SongResult } from '@/types';
import { currentTime } from '@/stores/motionSignals';
import { captureExternalPlaybackFavorite } from '@/services/externalPlaybackFavorite';
import type { UnifiedSong } from '@/types';
import type { ModRuntimeInfo } from '@/mods/types';

// test/unit/mod-system/foliumPlaybackSessions.test.ts
const mod = (overrides: Partial<ModRuntimeInfo> = {}): ModRuntimeInfo => ({
    id: 'session-test',
    name: 'Test',
    version: '1.0.0',
    author: null,
    description: null,
    permissions: ['playback.control'],
    experimental: ['playback.sessions'],
    enabled: true,
    status: 'loaded',
    error: null,
    trustStale: false,
    signature: { status: 'unsigned', reason: null, keyId: null, keyLabel: null, signedAt: null },
    devSource: false,
    embedOrigins: [],
    folia: null,
    hasMain: false,
    clientUrl: null,
    ...overrides,
});
const original = usePlaybackStore.getState();
const song = (providerId = 'netease', id = '99') =>
    ({
        id,
        name: 'Test',
        artists: [],
        album: { id: 'album', name: '' },
        durationMs: 100000,
        sourceRef: { kind: 'online', providerId, mediaId: id },
    }) as UnifiedSong;
const options = (onIntent: (event: FoliumPlaybackSessionIntent) => void | Promise<void> = vi.fn()) => ({
    onIntent,
    restore: 'queue-stopped' as const,
});
const host = {
    play: vi.fn(async (_song: SongResult, request: PlaybackRequest) => {
        request.finish('source-committed');
    }),
    stop: vi.fn(),
    seek: vi.fn(),
};
beforeEach(() => {
    vi.clearAllMocks();
    usePlaybackStore.setState(original, true);
    registerExternalPlaybackActions(host);
});
afterEach(async () => {
    await reconcileFoliumClients([], 'main');
    for (const id of ['session-test', 'other']) disposeFoliumServices(id);
    releaseAllExternalPlayback();
    registerExternalPlaybackActions(null);
});

describe('experimental playback.sessions', () => {
    it('exposes confirmed favourite DTOs without adding a playback intent', () => {
        const service = createFoliumPlaybackSessions(mod()), onFavoriteChanged = vi.fn(), intent = vi.fn();
        expect(service.supportsFavoriteEvents).toBe(true);
        const lease = service.acquire({ ...options(intent), onFavoriteChanged });
        lease.setQueue({ entries: [{ id: 'occurrence', track: { id: '99', source: 'netease', title: 'Test', artist: '' }, actions: [] }],
            currentId: 'occurrence', canNext: true });
        const media = song();
        usePlaybackStore.setState({ currentSong: media, audioSrc: 'room-source' });
        captureExternalPlaybackFavorite(media)?.(true);
        expect(onFavoriteChanged).toHaveBeenCalledExactlyOnceWith({ song: toFoliumSong(media), entryId: 'occurrence', liked: true });
        expect(intent).not.toHaveBeenCalled();
        lease.release();
        expect(() => service.acquire({ ...options(), onFavoriteChanged: true } as any)).toThrow('invalid-playback-session-options');
    });
    it('keeps Stop out of toolbar actions and revalidates its availability before dispatch', () => {
        const intent = vi.fn(), lease = createFoliumPlaybackSessions(mod()).acquire(options(intent));
        const stopAction = { id: 'stop-preview', label: { en: 'Stop audition' }, icon: 'square' as const };
        const queue = { entries: [], currentId: null, canNext: false, actions: [], stopAction };
        lease.setQueue(queue);
        expect(useExternalQueueStore.getState().view?.actions).toEqual([]);
        expect(stopExternalPlayback()).toBe(true);
        expect(intent).toHaveBeenLastCalledWith({ type: 'queue-action', entryId: null, actionId: 'stop-preview' });
        intent.mockClear();
        lease.setQueue({ ...queue, stopAction: { ...stopAction, disabled: true } });
        expect(stopExternalPlayback()).toBe(true);
        expect(intent).not.toHaveBeenCalled();
        expect(() => lease.setQueue({ ...queue, actions: [stopAction] })).toThrow('duplicate-queue-stop-action');
        lease.setQueue({ ...queue, stopAction: undefined });
        expect(stopExternalPlayback()).toBe(false);
        expect(invokeExternalQueueAction(null, 'stop-preview')).toBe(false);
    });
    it('exposes opt-in audition DTOs and validates the advertised resume action', () => {
        const service = createFoliumPlaybackSessions(mod()), intent = vi.fn();
        expect(service.supportsAudition).toBe(true);
        const lease = service.acquire({ ...options(intent), audition: true });
        const media = song();
        routeExternalPlay(media);
        expect(intent).toHaveBeenLastCalledWith({ type: 'audition', song: toFoliumSong(media) });
        const queue = { entries: [], currentId: null, canNext: true, canSeek: true, canPrevious: true,
            resumeActionId: 'return', actions: [{ id: 'return', label: { en: 'Return' }, icon: 'refresh-cw' as const }] };
        lease.setQueue(queue);
        expect(useExternalQueueStore.getState().view).toMatchObject({ resumeActionId: 'return', canSeek: true, canPrevious: true });
        expect(invokeExternalQueueAction(null, 'return')).toBe(true);
        expect(intent).toHaveBeenLastCalledWith({ type: 'queue-action', entryId: null, actionId: 'return' });
        expect(() => lease.setQueue({ ...queue, actions: [] })).toThrow('invalid-queue-resume-action');
        lease.setQueue({ entries: [], currentId: null, canNext: false });
        expect(useExternalQueueStore.getState().view).toMatchObject({ canSeek: false, canPrevious: false });
    });
    it.each([PlayerState.PLAYING, PlayerState.PAUSED])('hands off committed audio without resetting time or state (%s)', (playerState) => {
        const originalQueue = [song('netease', '1')], current = song('netease', '2');
        usePlaybackStore.setState({ playQueue: originalQueue });
        const lease = createFoliumPlaybackSessions(mod()).acquire(options());
        usePlaybackStore.setState({ currentSong: current, audioSrc: 'blob:playing', duration: 100, playerState });
        currentTime.set(36);
        host.stop.mockClear();
        lease.handoff!();
        expect(host.stop).not.toHaveBeenCalled();
        expect(hasExternalPlayback()).toBe(false);
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: current, audioSrc: 'blob:playing', playerState, playQueue: [current, ...originalQueue] });
        expect(currentTime.get()).toBe(36);
        lease.handoff!();
        lease.release();
        expect(host.stop).not.toHaveBeenCalled();
    });
    it('cancels pending sources on handoff and falls back to stopped restoration without committed audio', async () => {
        host.play.mockImplementationOnce(() => new Promise(() => {}));
        const lease = createFoliumPlaybackSessions(mod()).acquire(options());
        const pending = lease.play(toFoliumSong(song())!);
        lease.handoff!();
        expect(await pending).toEqual({ status: 'cancelled' });
        expect(usePlaybackStore.getState().currentSong).toBeNull();
        expect(hasExternalPlayback()).toBe(false);
    });
    it('projects repeated recordings as distinct occurrences and routes current validated actions', () => {
        const intent = vi.fn(), service = createFoliumPlaybackSessions(mod());
        const originalQueue = [song()];
        usePlaybackStore.setState({ playQueue: originalQueue });
        const lease = service.acquire(options(intent));
        const track = { id: 'song', source: 'qq', title: 'Same recording', artist: 'Artist' };
        const remove = { id: 'remove', label: { en: 'Remove' }, icon: 'trash-2' as const };
        const input = { entries: [{ id: 'a', track, actions: [] }, { id: 'b', track, actions: [remove] }],
            currentId: 'a', canNext: true };
        lease.setQueue(input);
        const view = useExternalQueueStore.getState().view!;
        expect(view.queue).toHaveLength(2);
        expect(usePlaybackStore.getState().playQueue).toEqual([]);
        expect(getPlaybackSongKey(view.queue[0])).toBe(getPlaybackSongKey(view.queue[1]));
        expect(getQueueSongKey(view.queue[0])).not.toBe(getQueueSongKey(view.queue[1]));
        expect(buildLatticeTiles({ queue: view.queue, currentSong: view.currentSong }).map(tile => tile.section)).toEqual(['now', 'upcoming']);
        expect(activateExternalQueueSong(view.queue[1])).toBe(true);
        expect(intent).not.toHaveBeenCalled();
        expect(invokeExternalQueueAction(getQueueSongKey(view.queue[1]), 'remove')).toBe(true);
        expect(intent).toHaveBeenLastCalledWith({ type: 'queue-action', entryId: 'b', actionId: 'remove' });
        lease.setQueue({ ...input, entries: [input.entries[0], { ...input.entries[1], actions: [{ ...remove, disabled: true }] }] });
        expect(invokeExternalQueueAction(getQueueSongKey(view.queue[1]), 'remove')).toBe(false);
        lease.release();
        expect(useExternalQueueStore.getState().view).toBeNull();
        expect(usePlaybackStore.getState().playQueue).toEqual(originalQueue);
        const next = service.acquire(options(intent));
        next.setQueue(input);
        expect(invokeExternalQueueAction(getQueueSongKey(view.queue[1]), 'remove')).toBe(false);
        expect(activateExternalQueueSong(view.queue[1])).toBe(true);
        expect(() => lease.setQueue(input)).toThrow('playback-session-released');
    });
    it('keeps song/queue identity stable as vote counts change and forwards every click', () => {
        const intent = vi.fn(), lease = createFoliumPlaybackSessions(mod()).acquire(options(intent));
        const vote = (count: number) => ({ entries: [{ id: 'now', track: { id: '1', source: 'qq', title: 'Song', artist: 'A' },
            actions: [{ id: 'vote', icon: 'thumbs-up' as const, label: { en: 'Vote' }, count }] }], currentId: 'now', canNext: true });
        lease.setQueue(vote(1));
        const before = useExternalQueueStore.getState().view!;
        lease.setQueue(vote(99));
        const after = useExternalQueueStore.getState().view!;
        expect(after.queue).toBe(before.queue);
        expect(after.currentSong).toBe(before.currentSong);
        for (let i = 0; i < 10; i++) invokeExternalQueueAction(getQueueSongKey(after.queue[0]), 'vote');
        expect(intent).toHaveBeenCalledTimes(10);
        expect(() => lease.setQueue({ ...vote(1), entries: [vote(1).entries[0], vote(1).entries[0]] })).toThrow('invalid-queue-entry');
        expect(useExternalQueueStore.getState().view).toBe(after);
    });
    it('stops an in-flight source without releasing queue ownership', async () => {
        host.play.mockImplementationOnce(() => new Promise(() => {}));
        const lease = createFoliumPlaybackSessions(mod()).acquire(options());
        const pending = lease.play(toFoliumSong(song())!);
        lease.stop();
        expect(await pending).toEqual({ status: 'cancelled' });
        expect(hasExternalPlayback()).toBe(true);
        expect(usePlaybackStore.getState().currentSong).toBeNull();
        lease.release();
        expect(() => lease.stop()).toThrow('playback-session-released');
    });

    it('reports source failure to the mod and returns failed without releasing its queue ownership', async () => {
        clearFoliumIssues('session-test');
        host.play.mockRejectedValueOnce(new Error('source load failed'));
        const lease = createFoliumPlaybackSessions(mod()).acquire(options());
        expect(await lease.play(toFoliumSong(song())!)).toEqual({ status: 'failed' });
        expect(useFoliumStatusStore.getState().issues['session-test']).toEqual([
            expect.objectContaining({ where: 'playback session', message: 'source load failed' }),
        ]);
        expect(hasExternalPlayback()).toBe(true);
    });

    it('is unavailable in the export context even when experimental services are supplied', () => {
        const allowed = mod();
        const api = createFoliumClientApi(allowed, {
            context: 'export',
            internals: null,
            experimental: createFoliumExperimental(allowed),
        });
        expect(() => api.experimental['playback.sessions']).toThrow('unavailable-in-export-context');
        expect(host.stop).not.toHaveBeenCalled();
    });
    it('uses the live host acquisition guard to reject recording without changing playback', () => {
        let recording = true;
        registerExternalPlaybackActions({ ...host, canAcquire: () => !recording });
        const service = createFoliumPlaybackSessions(mod());
        expect(() => service.acquire(options())).toThrow('external-playback-context-unavailable');
        expect(host.stop).not.toHaveBeenCalled();
        recording = false;
        service.acquire(options()).release();
        expect(hasExternalPlayback()).toBe(false);
    });
    it('requires opt-in and playback.control, without requiring internals or a pinned host', () => {
        expect(() => createFoliumPlaybackSessions(mod({ experimental: [] })).acquire(options())).toThrow(
            'experimental-not-declared',
        );
        const denied = mod({ permissions: [] });
        const deniedApi = createFoliumClientApi(denied, {
            context: 'main',
            internals: null,
            experimental: createFoliumExperimental(denied),
        });
        expect(() => deniedApi.experimental['playback.sessions'].acquire(options())).toThrow(
            'permission-denied:playback.control',
        );
        const allowed = mod();
        const api = createFoliumClientApi(allowed, {
            context: 'main',
            internals: null,
            experimental: createFoliumExperimental(allowed),
        });
        const lease = api.experimental['playback.sessions'].acquire(options());
        expect(hasExternalPlayback()).toBe(true);
        lease.release();
    });
    it('resolves opaque IDs through the explicitly selected Omni provider and plays their host refs', async () => {
        const service = createFoliumPlaybackSessions(mod());
        vi.mocked(omni.getSongDetail).mockResolvedValue(song('qq', 'opaque-mid'));
        const dto = await service.resolveSong('qq', 'opaque-mid');
        expect(omni.getSongDetail).toHaveBeenCalledWith('qq', 'opaque-mid');
        const lease = service.acquire(options());
        expect(await lease.play(dto)).toEqual({ status: 'source-committed' });
        expect(host.play.mock.calls[0][0].sourceRef).toMatchObject({ providerId: 'qq' });
    });
    it('preserves the discriminated seek payload and distinct enqueue/play intents', () => {
        const received: FoliumPlaybackSessionIntent[] = [];
        createFoliumPlaybackSessions(mod()).acquire(
            options((intent) => {
                received.push(intent);
            }),
        );
        routeExternalPlayback({ type: 'seek', seconds: 22, resume: false });
        routeExternalPlayback({ type: 'enqueue', songs: [song()] });
        routeExternalPlayback({ type: 'play', song: song() });
        const intent = received[0];
        if (intent.type !== 'seek') throw Error('Expected seek');
        const seconds: number = intent.seconds;
        expect(seconds).toBe(22);
        expect(intent.resume).toBe(false);
        expect(received.map((event) => event.type)).toEqual(['seek', 'enqueue', 'play']);
    });
    it('reports cancelled host work instead of claiming that an empty load committed a source', async () => {
        host.play.mockImplementationOnce(async () => {});
        const lease = createFoliumPlaybackSessions(mod()).acquire(options());
        expect(await lease.play(toFoliumSong(song())!)).toEqual({ status: 'cancelled' });
    });
    it('cancels pending play on teardown and makes retained service handles unusable', async () => {
        host.play.mockImplementationOnce(() => new Promise(() => {}));
        const service = createFoliumPlaybackSessions(mod()),
            lease = service.acquire(options());
        const pending = lease.play(toFoliumSong(song())!);
        disposeFoliumServices('session-test');
        expect(await pending).toEqual({ status: 'cancelled' });
        expect(hasExternalPlayback()).toBe(false);
        expect(() => service.acquire(options())).toThrow('mod-service-disposed');
        expect(await lease.play(toFoliumSong(song())!)).toEqual({ status: 'cancelled' });
    });
    it('releases on host teardown, and even stop errors cannot strand the owner or original queue', () => {
        const queue = [song()];
        usePlaybackStore.setState({ playQueue: queue });
        createFoliumPlaybackSessions(mod()).acquire(options());
        host.stop.mockImplementationOnce(() => {
            throw Error('failed stop');
        });
        registerExternalPlaybackActions(null);
        expect(hasExternalPlayback()).toBe(false);
        expect(usePlaybackStore.getState().playQueue).toEqual(queue);
        expect(usePlaybackStore.getState().currentSong).toBeNull();
    });
    it('rejects FM and Stage before mutating their queues or context', () => {
        const queue = [song()];
        usePlaybackStore.setState({ playQueue: queue, isFmMode: true });
        const service = createFoliumPlaybackSessions(mod());
        expect(() => service.acquire(options())).toThrow('external-playback-context-unavailable');
        expect(usePlaybackStore.getState().isFmMode).toBe(true);
        expect(usePlaybackStore.getState().playQueue).toBe(queue);
        usePlaybackStore.setState({ isFmMode: false, activePlaybackContext: 'stage' });
        expect(() => service.acquire(options())).toThrow('external-playback-context-unavailable');
        expect(host.stop).not.toHaveBeenCalled();
        expect(hasExternalPlayback()).toBe(false);
    });
    it('rolls back an acquisition that fails while stopping the host', () => {
        const queue = [song()];
        usePlaybackStore.setState({ playQueue: queue });
        host.stop.mockImplementationOnce(() => {
            throw Error('stop failed');
        });
        expect(() => createFoliumPlaybackSessions(mod()).acquire(options())).toThrow('stop failed');
        expect(hasExternalPlayback()).toBe(false);
        expect(usePlaybackStore.getState().playQueue).toEqual(queue);
    });
    it('cleans a lease acquired before a client activation throws', async () => {
        const source = `export default api => { api.experimental['playback.sessions'].acquire({restore:'queue-stopped',onIntent(){}}); throw Error('activation failed'); };`;
        await reconcileFoliumClients(
            [mod({ clientUrl: `data:text/javascript,${encodeURIComponent(source)}` })],
            'main',
        );
        expect(host.stop).toHaveBeenCalledTimes(2);
        expect(hasExternalPlayback()).toBe(false);
    });
    it('cleans a lease even when the client disposer throws', async () => {
        const source = `export default api => { api.experimental['playback.sessions'].acquire({restore:'queue-stopped',onIntent(){}}); return () => { throw Error('dispose failed'); }; };`;
        await reconcileFoliumClients(
            [mod({ clientUrl: `data:text/javascript,${encodeURIComponent(source)}` })],
            'main',
        );
        expect(hasExternalPlayback()).toBe(true);
        await reconcileFoliumClients([], 'main');
        expect(hasExternalPlayback()).toBe(false);
    });
});


describe('window continuation in the scoped session API', () => {
    it('carries the original private queue and reacquires only after the host snapshot is ready', () => {
        const originalQueue = [song('netease', '11')], roomSong = song();
        usePlaybackStore.setState({ playQueue: originalQueue });
        const previous = createFoliumPlaybackSessions(mod());
        previous.acquire({ ...options(), captureWindowState: () => ({ uid: '9', roomId: 'room' }) });
        const ticket = capturePlaybackWindowResume()!;
        expect(ticket.queue).toEqual(originalQueue);
        disposeFoliumServices('session-test');
        // New renderer: the ordinary handoff has completed source/queue restoration first.
        usePlaybackStore.setState({ playQueue: ticket.queue, currentSong: roomSong, audioSrc: 'restored-source' });
        const current = createFoliumPlaybackSessions(mod());
        let resumed: ReturnType<typeof current.acquire> | undefined;
        const resume = vi.fn(() => {
            expect(usePlaybackStore.getState().audioSrc).toBe('restored-source');
            resumed = current.acquire(options());
        });
        current.onWindowResume!(resume);
        expect(hasExternalPlayback()).toBe(false);
        restorePlaybackWindowResume(ticket);
        expect(resume).toHaveBeenCalledOnce();
        expect(hasExternalPlayback()).toBe(true);
        resumed!.release();
        expect(usePlaybackStore.getState().playQueue).toEqual(originalQueue);
    });
    it('removes a disabled client listener and respects the host acquisition guard during resume', () => {
        const old = createFoliumPlaybackSessions(mod()), oldResume = vi.fn();
        old.onWindowResume!(oldResume);
        old.acquire({ ...options(), captureWindowState: () => ({ roomId: 'room' }) });
        const ticket = capturePlaybackWindowResume()!;
        disposeFoliumServices('session-test');
        registerExternalPlaybackActions({ ...host, canAcquire: () => false });
        const next = createFoliumPlaybackSessions(mod()), resume = vi.fn(() => {
            expect(() => next.acquire(options())).toThrow('external-playback-context-unavailable');
        });
        next.onWindowResume!(resume);
        restorePlaybackWindowResume(ticket);
        expect(oldResume).not.toHaveBeenCalled();
        expect(resume).toHaveBeenCalledOnce();
        expect(hasExternalPlayback()).toBe(false);
    });
});

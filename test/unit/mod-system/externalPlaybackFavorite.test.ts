// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { captureExternalPlaybackFavorite } from '@/services/externalPlaybackFavorite';
import { acquireExternalPlayback, hasExternalPlayback, releaseAllExternalPlayback } from '@/services/externalPlaybackSession';
import { setExternalQueue, useExternalQueueStore } from '@/services/externalPlaybackQueue';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { createExternalQueueAdapter } from '@/mods/folium/externalQueueAdapter';
import type { FoliumPlaybackQueue } from '@/mods/folium/contract';
import type { SongResult } from '@/types';

// test/unit/mod-system/externalPlaybackFavorite.test.ts
const song = (providerId = 'netease'): SongResult => ({
    id: '99', name: 'Song', artists: [], album: { id: '1', name: '' }, durationMs: 1000,
    sourceRef: { kind: 'online', providerId, mediaId: '99' },
});
const queue = (currentId = 'first', source = 'netease'): FoliumPlaybackQueue => ({
    entries: ['first', 'second'].map(id => ({
        id, track: { id: '99', source, title: 'Song', artist: '' }, actions: [],
    })),
    currentId, canNext: true,
});
const initial = usePlaybackStore.getState();
function setup(favoriteChanged: Parameters<typeof acquireExternalPlayback>[0]['favoriteChanged'] = vi.fn()) {
    const cleanup = vi.fn(), report = vi.fn();
    const owner = acquireExternalPlayback({ modId: 'test', dispatch: vi.fn(), cleanup, report, favoriteChanged });
    const adapt = createExternalQueueAdapter(owner);
    const publish = (value = queue()) => setExternalQueue(adapt(value));
    publish();
    usePlaybackStore.setState({ currentSong: song(), audioSrc: 'room-audio' });
    return { publish, favoriteChanged, cleanup, report };
}
afterEach(() => {
    releaseAllExternalPlayback();
    useExternalQueueStore.setState({ view: null });
    usePlaybackStore.setState(initial, true);
});

describe('confirmed favourites for a session occurrence', () => {
    it('does nothing without an opted-in owner or current queue entry', () => {
        expect(captureExternalPlaybackFavorite(song())).toBeUndefined();
        const owner = acquireExternalPlayback({ modId: 'legacy', dispatch: vi.fn(), cleanup: vi.fn(), report: vi.fn() });
        setExternalQueue(createExternalQueueAdapter(owner)(queue()));
        usePlaybackStore.setState({ currentSong: song() });
        expect(captureExternalPlaybackFavorite(song())).toBeUndefined();
    });
    it.each([true, false])('reports confirmed liked=%s with the original business entry id', liked => {
        const state = setup();
        const media = song(), notify = captureExternalPlaybackFavorite(media);
        expect(state.favoriteChanged).not.toHaveBeenCalled();
        // Metadata/actions can refresh during a request without changing the occurrence.
        state.publish({ ...queue(), totalCount: 5, loading: true });
        notify?.(liked);
        expect(state.favoriteChanged).toHaveBeenCalledExactlyOnceWith({ song: media, entryId: 'first', liked });
    });
    it('drops the result after the same recording advances to another occurrence', () => {
        const state = setup(), notify = captureExternalPlaybackFavorite(song());
        state.publish(queue('second'));
        notify?.(true);
        expect(state.favoriteChanged).not.toHaveBeenCalled();
    });
    it('drops a result across release/reacquire even when the mod and entry ids repeat', () => {
        const first = setup(), notify = captureExternalPlaybackFavorite(song());
        releaseAllExternalPlayback();
        const next = setup();
        notify?.(true);
        expect(first.favoriteChanged).not.toHaveBeenCalled();
        expect(next.favoriteChanged).not.toHaveBeenCalled();
    });
    it('requires the same provider/media source in both the queue and actual player', () => {
        const state = setup();
        expect(captureExternalPlaybackFavorite(song('qq'))).toBeUndefined();
        const notify = captureExternalPlaybackFavorite(song());
        state.publish(queue('first', 'qq'));
        notify?.(true);
        state.publish();
        usePlaybackStore.setState({ currentSong: song('qq') });
        notify?.(true);
        expect(captureExternalPlaybackFavorite(song())).toBeUndefined();
        expect(state.favoriteChanged).not.toHaveBeenCalled();
    });
    it('does not observe auditions even when they use the same recording as the room', () => {
        const state = setup(), notify = captureExternalPlaybackFavorite(song());
        state.publish({ ...queue(), stopAction: { id: 'stop', label: { en: 'Stop' }, icon: 'square' } });
        expect(captureExternalPlaybackFavorite(song())).toBeUndefined();
        notify?.(true);
        expect(state.favoriteChanged).not.toHaveBeenCalled();
    });
    it('drops results when the queue or actual current song disappears', () => {
        const state = setup(), notify = captureExternalPlaybackFavorite(song());
        state.publish({ ...queue(), currentId: null });
        notify?.(true);
        state.publish();
        usePlaybackStore.setState({ currentSong: null });
        notify?.(true);
        expect(state.favoriteChanged).not.toHaveBeenCalled();
    });
    it.each(['throw', 'reject'])('reports an observer %s without releasing or stopping playback', async mode => {
        const error = new Error('Room notification failed');
        const state = setup(() => {
            if (mode === 'throw') throw error;
            return Promise.reject(error);
        });
        expect(() => captureExternalPlaybackFavorite(song())?.(true)).not.toThrow();
        await Promise.resolve();
        expect(state.report).toHaveBeenCalledExactlyOnceWith(error);
        expect(state.cleanup).not.toHaveBeenCalled();
        expect(hasExternalPlayback()).toBe(true);
        expect(usePlaybackStore.getState().audioSrc).toBe('room-audio');
    });
});

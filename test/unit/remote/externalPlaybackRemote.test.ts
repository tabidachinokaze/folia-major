import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    invokeRemoteSessionAction,
    isRemoteSessionTransportBlocked,
    readRemotePlaybackSession,
} from '@/services/externalPlaybackRemote';
import { acquireExternalPlayback, releaseAllExternalPlayback, releaseExternalPlayback } from '@/services/externalPlaybackSession';
import { setExternalQueue, useExternalQueueStore } from '@/services/externalPlaybackQueue';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { SongResult } from '@/types';
import type { ExternalQueueAction, ExternalQueueView } from '@/types/externalPlayback';
import type { RemoteControlCommand, RemoteSessionAction } from '@/types/remoteControl';

// test/unit/remote/externalPlaybackRemote.test.ts
const initialPlayback = usePlaybackStore.getState();
afterEach(() => {
    releaseAllExternalPlayback();
    useExternalQueueStore.setState({ view: null });
    usePlaybackStore.setState(initialPlayback, true);
});

const song = (entryKey: string): SongResult => ({
    id: 'same-song', name: 'Repeated song', artists: [], album: { id: 'album', name: 'Album' },
    durationMs: 180000, sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'same-song' },
    externalQueueEntryKey: entryKey,
});
const vote: ExternalQueueAction = {
    id: 'room-vote', icon: 'thumbs-up', label: { 'zh-CN': '为这首歌点赞', en: 'Like this room song' }, count: 3,
};
const resume: ExternalQueueAction = {
    id: 'return-to-room', icon: 'refresh-cw', label: { 'zh-CN': '回到房间', en: 'Return to room' },
};
function session(overrides: Partial<ExternalQueueView> = {}) {
    const dispatch = vi.fn();
    const owner = acquireExternalPlayback({ modId: 'room-test', dispatch, cleanup: vi.fn(), report: vi.fn() });
    const current = song('room:occurrence-one');
    const waiting = song('room:occurrence-two');
    const view: ExternalQueueView = {
        owner,
        items: new Map([
            [current.externalQueueEntryKey!, { id: 'biz-one', song: current, actions: [vote] }],
            [waiting.externalQueueEntryKey!, { id: 'biz-two', song: waiting, actions: [vote] }],
        ]),
        queue: [current, waiting], currentSong: current, actions: [],
        canNext: true, totalCount: 2, loading: false, ...overrides,
    };
    setExternalQueue(view);
    return { owner, dispatch, view, current, waiting };
}
const actionCommand = (sessionId: string, action: RemoteSessionAction): Extract<RemoteControlCommand, { type: 'session-action' }> => ({
    type: 'session-action', sessionId, actionId: action.id, entryKey: action.entryKey,
});

describe('remote controls for an external playback session', () => {
    it('publishes Stop separately from toolbar controls and rejects it after audition ends', () => {
        const { view, dispatch } = session();
        const stopAction: ExternalQueueAction = { id: 'stop-preview', icon: 'square', label: { en: 'Stop audition' } };
        setExternalQueue({ ...view, stopAction });
        const snapshot = readRemotePlaybackSession()!;
        expect(snapshot.vote).toBeUndefined();
        expect(snapshot.resume).toBeUndefined();
        expect(snapshot.stop).toMatchObject({ id: 'stop-preview', entryKey: null });
        const command = actionCommand(snapshot.id, snapshot.stop!);
        expect(invokeRemoteSessionAction(command)).toBe(true);
        expect(dispatch).toHaveBeenLastCalledWith({ type: 'queue-action', entryId: null, actionId: 'stop-preview' });
        setExternalQueue(view);
        expect(invokeRemoteSessionAction(command)).toBe(false);
    });
    it('gets next availability from the room even when the private queue has one song', () => {
        usePlaybackStore.setState({ playQueue: [song('private')] });
        session({ canNext: true });
        expect(readRemotePlaybackSession()?.canNext).toBe(true);
        expect(isRemoteSessionTransportBlocked({ type: 'next' })).toBe(false);
    });

    it('blocks next when the room disallows it despite multiple private tracks', () => {
        usePlaybackStore.setState({ playQueue: [song('private-a'), song('private-b')] });
        session({ canNext: false });
        expect(readRemotePlaybackSession()?.canNext).toBe(false);
        expect(isRemoteSessionTransportBlocked({ type: 'next' })).toBe(true);
    });

    it('blocks seek, previous, and looping while following the room, but allows local play and pause', () => {
        session();
        expect(readRemotePlaybackSession()).toMatchObject({ canSeek: false, canPrevious: false });
        expect(isRemoteSessionTransportBlocked({ type: 'seek', time: 42 })).toBe(true);
        expect(isRemoteSessionTransportBlocked({ type: 'previous' })).toBe(true);
        expect(isRemoteSessionTransportBlocked({ type: 'cycle-loop-mode' })).toBe(true);
        expect(isRemoteSessionTransportBlocked({ type: 'play' })).toBe(false);
        expect(isRemoteSessionTransportBlocked({ type: 'pause' })).toBe(false);
    });

    it('dispatches repeated votes only to the current room occurrence instead of the favorite-song action', () => {
        const { dispatch } = session();
        const snapshot = readRemotePlaybackSession()!;
        expect(snapshot.vote).toMatchObject({ id: vote.id, entryKey: 'room:occurrence-one', count: 3, label: vote.label });
        const command = actionCommand(snapshot.id, snapshot.vote!);
        expect(invokeRemoteSessionAction(command)).toBe(true);
        expect(invokeRemoteSessionAction(command)).toBe(true);
        expect(dispatch.mock.calls.map(([intent]) => intent)).toEqual([
            { type: 'queue-action', entryId: 'biz-one', actionId: 'room-vote' },
            { type: 'queue-action', entryId: 'biz-one', actionId: 'room-vote' },
        ]);
    });

    it('ignores a delayed vote after a different occurrence of the same song starts', () => {
        const { dispatch, view, waiting } = session();
        const previous = readRemotePlaybackSession()!;
        const command = actionCommand(previous.id, previous.vote!);
        // The old entry deliberately remains present: membership alone is insufficient.
        setExternalQueue({ ...view, currentSong: waiting });
        const current = readRemotePlaybackSession()!;
        expect(current.id).toBe(previous.id);
        expect(current.vote?.entryKey).toBe(waiting.externalQueueEntryKey);
        expect(invokeRemoteSessionAction(command)).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('ignores a delayed vote after the owner changes even if entry and action ids are reused', () => {
        const first = session();
        const previous = readRemotePlaybackSession()!;
        releaseExternalPlayback(first.owner);
        const second = session();
        const current = readRemotePlaybackSession()!;
        expect(current.id).not.toBe(previous.id);
        expect(current.vote).toEqual(previous.vote);
        expect(invokeRemoteSessionAction(actionCommand(previous.id, previous.vote!))).toBe(false);
        expect(first.dispatch).not.toHaveBeenCalled();
        expect(second.dispatch).not.toHaveBeenCalled();
    });

    it('rechecks a disabled or removed vote at dispatch time', () => {
        const { view, current, dispatch } = session();
        const snapshot = readRemotePlaybackSession()!;
        const command = actionCommand(snapshot.id, snapshot.vote!);
        const items = new Map(view.items);
        items.set(current.externalQueueEntryKey!, { id: 'biz-one', song: current, actions: [{ ...vote, disabled: true }] });
        setExternalQueue({ ...view, items });
        expect(invokeRemoteSessionAction(command)).toBe(false);
        items.set(current.externalQueueEntryKey!, { id: 'biz-one', song: current, actions: [] });
        setExternalQueue({ ...view, items });
        expect(invokeRemoteSessionAction(command)).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('exposes only resume during audition, allows seek and previous, and rejects the prior room vote', () => {
        const { dispatch, view } = session();
        const previous = readRemotePlaybackSession()!;
        setExternalQueue({ ...view, canSeek: true, canPrevious: true, actions: [resume], resumeActionId: resume.id });
        const audition = readRemotePlaybackSession()!;
        expect(audition).toMatchObject({ canSeek: true, canPrevious: true });
        expect(audition.vote).toBeUndefined();
        expect(audition.resume).toMatchObject({ id: resume.id, entryKey: null });
        expect(isRemoteSessionTransportBlocked({ type: 'seek', time: 20 })).toBe(false);
        expect(isRemoteSessionTransportBlocked({ type: 'previous' })).toBe(false);
        expect(isRemoteSessionTransportBlocked({ type: 'cycle-loop-mode' })).toBe(true);
        expect(invokeRemoteSessionAction(actionCommand(previous.id, previous.vote!))).toBe(false);
        expect(invokeRemoteSessionAction(actionCommand(audition.id, audition.resume!))).toBe(true);
        expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'queue-action', entryId: null, actionId: resume.id });
    });

    it('rejects stale queue actions after release and does not limit ordinary local playback', () => {
        const { owner, dispatch } = session();
        const previous = readRemotePlaybackSession()!;
        releaseExternalPlayback(owner);
        // A view can survive briefly during teardown; the owner remains authoritative.
        expect(readRemotePlaybackSession()).toBeNull();
        expect(invokeRemoteSessionAction(actionCommand(previous.id, previous.vote!))).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
        expect(isRemoteSessionTransportBlocked({ type: 'seek', time: 10 })).toBe(false);
        expect(isRemoteSessionTransportBlocked({ type: 'previous' })).toBe(false);
        expect(isRemoteSessionTransportBlocked({ type: 'cycle-loop-mode' })).toBe(false);
    });

    it('blocks room transport while its queue is not published yet', () => {
        acquireExternalPlayback({ modId: 'loading-room', dispatch: vi.fn(), cleanup: vi.fn(), report: vi.fn() });
        expect(readRemotePlaybackSession()).toBeNull();
        expect(isRemoteSessionTransportBlocked({ type: 'next' })).toBe(true);
        expect(isRemoteSessionTransportBlocked({ type: 'previous' })).toBe(true);
        expect(isRemoteSessionTransportBlocked({ type: 'seek', time: 10 })).toBe(true);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateQueueViewSong, invokeQueueViewAction, queueViewsRegistry, readQueueView } from '@/mods/folium/registries/queueViews';
import { createQueueViewAdapter } from '@/mods/folium/queueViewAdapter';
import type { FoliumQueueViewSnapshot } from '@/mods/folium/contract';
import { getPlaybackSongKey, getQueueSongKey } from '@/utils/appPlaybackGuards';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { buildLatticeTiles } from '@/components/app/lattice/latticeModel';

// test/unit/mod-system/foliumQueueViews.test.ts
// Exercise real presentation registrations, occurrence identity and delayed actions without audio IO.
const action = (count = 0) => ({ id: 'vote', icon: 'thumbs-up', label: { en: 'Vote' }, count });
const snapshot = (count = 0): FoliumQueueViewSnapshot => ({
    currentId: 'first', entries: [
        { id: 'first', track: { id: 'same', source: 'netease', title: 'Same media', artist: 'Artist' }, overline: { en: 'Alice' }, actions: [action(count)] },
        { id: 'second', track: { id: 'same', source: 'netease', title: 'Same media', artist: 'Artist' }, overline: { en: 'System recommendation' }, actions: [action(count)] },
    ], actions: [{ id: 'sync', label: { en: 'Sync' }, icon: 'refresh-cw' }],
});
function register() {
    let value = snapshot(), changed = () => {};
    const onAction = vi.fn(), stop = vi.fn();
    const handle = queueViewsRegistry.register('queue-test', { id: 'view', getSnapshot: () => value,
        subscribe: listener => { changed = listener; return stop; }, onAction });
    return { handle, onAction, stop, update(next: FoliumQueueViewSnapshot, notify = true) { value = next; if (notify) changed(); } };
}
afterEach(() => queueViewsRegistry.list().forEach(entry => queueViewsRegistry.unregister(entry.id)));

describe('UI-only queue presentation', () => {
    it('projects duplicate media as distinct stable occurrences without touching private playback', () => {
        const privateBefore = usePlaybackStore.getState();
        const registration = register(), before = readQueueView()!;
        expect(getPlaybackSongKey(before.queue[0])).toBe(getPlaybackSongKey(before.queue[1]));
        expect(getQueueSongKey(before.queue[0])).not.toBe(getQueueSongKey(before.queue[1]));
        expect(buildLatticeTiles({ queue: before.queue, currentSong: before.currentSong }).map(tile => tile.section)).toEqual(['now', 'upcoming']);
        registration.update({ ...snapshot(), entries: [...snapshot().entries].reverse() });
        expect(readQueueView()!.queue[1]).toBe(before.queue[0]);
        expect(readQueueView()!.queue[0]).toBe(before.queue[1]);
        expect(usePlaybackStore.getState()).toBe(privateBefore);
        registration.handle.unregister();
        expect(readQueueView()).toBeNull();
        expect(usePlaybackStore.getState()).toBe(privateBefore);
        expect(registration.stop).toHaveBeenCalledOnce();
    });

    it('retains queue/song identity across counts and unchanged notifications', () => {
        const registration = register(), before = readQueueView()!;
        registration.update(snapshot(2));
        const counted = readQueueView()!;
        expect(counted.queue).toBe(before.queue);
        expect(counted.queue[0]).toBe(before.queue[0]);
        expect(counted.entries.get(getQueueSongKey(counted.queue[0]))!.actions[0].count).toBe(2);
        registration.update(snapshot(2));
        expect(readQueueView()).toBe(counted);
    });

    it('executes each repeated vote against its original occurrence after reordering', async () => {
        const registration = register(), before = readQueueView()!, key = getQueueSongKey(before.queue[1]);
        registration.update({ ...snapshot(3), entries: [...snapshot(3).entries].reverse() });
        for (let i = 0; i < 3; i++) expect(await invokeQueueViewAction(before.owner, key, 'vote')).toBe(true);
        expect(registration.onAction).toHaveBeenCalledTimes(3);
        expect(registration.onAction).toHaveBeenLastCalledWith({ entryId: 'second', actionId: 'vote' });
    });

    it('re-reads snapshot permissions/deletion even before a subscribe notification', async () => {
        const registration = register(), before = readQueueView()!, key = getQueueSongKey(before.queue[1]);
        registration.update({ ...snapshot(), entries: [snapshot().entries[0]] }, false);
        expect(await invokeQueueViewAction(before.owner, key, 'vote')).toBe(false);
        const disabled = snapshot();
        disabled.entries = disabled.entries.map(entry => ({ ...entry, actions: [{ ...action(), disabled: true }] }));
        registration.update(disabled, false);
        expect(await invokeQueueViewAction(before.owner, key, 'vote')).toBe(false);
        expect(registration.onAction).not.toHaveBeenCalled();
    });

    it('invalidates callbacks on disposal and re-registration, including expired row selection', async () => {
        const registration = register(), old = readQueueView()!, song = old.queue[0];
        registration.handle.unregister();
        const replacement = register();
        expect(await invokeQueueViewAction(old.owner, getQueueSongKey(song), 'vote')).toBe(false);
        expect(activateQueueViewSong(song)).toBe(true);
        expect(replacement.onAction).not.toHaveBeenCalled();
        registration.handle.unregister();
        expect(readQueueView()).not.toBeNull();
    });

    it('consumes row selection without local playback, optionally forwarding the declared action', async () => {
        const registration = register();
        expect(activateQueueViewSong(readQueueView()!.queue[0])).toBe(true);
        expect(registration.onAction).not.toHaveBeenCalled();
        const selected = snapshot(); selected.entries = selected.entries.map(entry => ({ ...entry, defaultAction: 'vote' }));
        registration.update(selected);
        expect(activateQueueViewSong(readQueueView()!.queue[1])).toBe(true);
        expect(registration.onAction).toHaveBeenCalledWith({ entryId: 'second', actionId: 'vote' });
    });

    it('rejects a competing presentation and malformed registrations without losing the current view', () => {
        register(); const before = readQueueView();
        expect(() => queueViewsRegistry.register('other', { id: 'view', getSnapshot: snapshot, subscribe: () => () => {}, onAction() {} })).toThrow('queue-view-busy');
        expect(readQueueView()).toBe(before);
        expect(queueViewsRegistry.list()).toHaveLength(1);
    });

    it('rolls back a throwing or invalid subscription and permits the next registration', () => {
        expect(() => queueViewsRegistry.register('broken', { id: 'view', getSnapshot: snapshot, subscribe: () => { throw Error('subscription'); }, onAction() {} })).toThrow('subscription');
        expect(readQueueView()).toBeNull();
        expect(queueViewsRegistry.list()).toHaveLength(0);
        expect(() => queueViewsRegistry.register('broken', { id: 'view', getSnapshot: snapshot, subscribe: () => undefined as any, onAction() {} })).toThrow('queue-view-subscription-disposer-required');
        expect(readQueueView()).toBeNull();
        expect(queueViewsRegistry.list()).toHaveLength(0);
        expect(() => register()).not.toThrow();
    });

    it('rejects invalid occurrence/action descriptions and current IDs', () => {
        const adapt = createQueueViewAdapter({}, 'test');
        expect(() => adapt({ ...snapshot(), entries: [snapshot().entries[0], snapshot().entries[0]] })).toThrow('invalid-queue-entry');
        expect(() => adapt({ ...snapshot(), currentId: 'missing' })).toThrow('queue-current-entry-missing');
        expect(() => adapt({ ...snapshot(), entries: [{ ...snapshot().entries[0], defaultAction: 'missing' }] })).toThrow('invalid-queue-default-action');
        expect(() => adapt({ ...snapshot(), entries: [{ ...snapshot().entries[0], actions: [action(-1)] }] })).toThrow('invalid-queue-action');
        expect(() => adapt({ ...snapshot(), totalCount: 1 })).toThrow('invalid-queue-view');
    });

    it('rejects unrenderable action IDs initially and retains the last valid view on bad updates', () => {
        const invalid = { ...snapshot(), actions: [{ id: 'sync queue', label: { en: 'Sync' } }] };
        expect(() => queueViewsRegistry.register('invalid', { id: 'view', getSnapshot: () => invalid, subscribe: () => () => {}, onAction() {} })).toThrow('invalid-queue-action');
        expect(readQueueView()).toBeNull(); expect(queueViewsRegistry.list()).toHaveLength(0);
        const registration = register(), before = readQueueView();
        registration.update(invalid);
        expect(readQueueView()).toBe(before);
        registration.update({ ...snapshot(), entries: snapshot().entries.map(entry => ({ ...entry, actions: [{ ...action(), id: 'vote\u0000' }] })) });
        expect(readQueueView()).toBe(before);
    });

    it('catches action errors and retains presentation instead of restoring private actions', async () => {
        const registration = register(), before = readQueueView()!;
        registration.onAction.mockRejectedValueOnce(Error('network'));
        expect(await invokeQueueViewAction(before.owner, null, 'sync')).toBe(false);
        expect(readQueueView()).toBe(before);
    });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerState } from '@/types';
import type { FoliumRemoteAction } from '@/mods/folium/contract';
import { remoteControlsRegistry, refreshRemoteControls, subscribeRemoteControls, resolveRemoteControls, invokeRemoteAction } from '@/mods/folium/registries/remoteControls';
import { buildRemoteControlActions, createRemoteControlActionBridge, createRemoteActionActivation, type RemoteActionSource } from '@/services/remoteControlActions';
import type { RemoteControlSnapshot } from '@/types/remoteControl';

// test/unit/mod-system/foliumRemoteControls.test.ts
const action = (id: string, run: FoliumRemoteAction['run'] = vi.fn()): FoliumRemoteAction => ({ id, label: { en: id }, icon: 'thumbs-up', run });
const source = (): RemoteActionSource => ({
    snapshot: { trackKey: 'song-a', hasTrack: true, controlsDisabled: false, playerState: PlayerState.PLAYING,
        canGoPrevious: true, canGoNext: true, loopMode: 'off', isLiked: false, canLike: true } as RemoteControlSnapshot,
    song: null, runNative: vi.fn(), t: key => key,
});
afterEach(() => {
    for (const entry of remoteControlsRegistry.list()) remoteControlsRegistry.unregister(entry.id);
    vi.restoreAllMocks();
});
describe('owned remote action lists', () => {
    it('publishes the new registry list before notifying remote subscribers', () => {
        const observed: number[] = [];
        const unsubscribe = subscribeRemoteControls(() => observed.push(remoteControlsRegistry.list().length));
        const handle = remoteControlsRegistry.register('mod', { id: 'edit', edit: () => {} });
        handle.unregister(); unsubscribe();
        expect(observed).toEqual([1, 0]);
    });
    it('composes ordered insert/remove/rewrite without changing the personal collection action', () => {
        const initial = source();
        remoteControlsRegistry.register('first', { id: 'edit', order: 1, edit: event => {
            event.transport.reverse(); event.actions.unshift(action('first:vote'));
        } });
        remoteControlsRegistry.register('second', { id: 'edit', order: 2, edit: event => {
            event.actions[0].count = 8; event.transport = event.transport.filter(item => item.id !== 'host:loop');
        } });
        const resolved = resolveRemoteControls(buildRemoteControlActions(initial), () => buildRemoteControlActions(initial));
        expect(resolved.transport.map(item => item.id)).toEqual(['host:next', 'host:play-pause', 'host:previous']);
        expect(resolved.actions.map(item => [item.id, item.count])).toEqual([['first:vote', 8], ['host:like', undefined]]);
        expect(resolved.actions[1].tone).toBe('alert');
    });
    it('discards duplicate ids, foreign new ids and async editors while continuing later editors', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        remoteControlsRegistry.register('duplicate', { id: 'edit', edit: event => { event.actions.push(event.actions[0]); } });
        remoteControlsRegistry.register('foreign', { id: 'edit', edit: event => { event.actions.push(action('other:vote')); } });
        remoteControlsRegistry.register('async', { id: 'edit', edit: async event => { event.actions.length = 0; } });
        remoteControlsRegistry.register('last', { id: 'edit', edit: event => { event.actions.push(action('last:vote')); } });
        const initial = source();
        const resolved = resolveRemoteControls(buildRemoteControlActions(initial), () => buildRemoteControlActions(initial));
        expect(resolved.actions.map(item => item.id)).toEqual(['host:like', 'last:vote']);
    });
    it('preserves native disabled guards even after an editor attempts to enable or replace the callback', async () => {
        const initial = source(); initial.snapshot.canGoNext = false;
        const run = vi.fn();
        remoteControlsRegistry.register('mod', { id: 'edit', edit: event => {
            const next = event.transport.find(item => item.id === 'host:next')!; next.disabled = false; next.run = run;
        } });
        const resolved = resolveRemoteControls(buildRemoteControlActions(initial), () => buildRemoteControlActions(initial));
        expect(await invokeRemoteAction(resolved.transport.find(item => item.id === 'host:next')!)).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });
    it('rejects a captured callback when its owner unregisters, even after same-id registration', async () => {
        const run = vi.fn(); const initial = source();
        const handle = remoteControlsRegistry.register('mod', { id: 'edit', edit: event => { event.actions.push(action('mod:vote', run)); } });
        const old = resolveRemoteControls(buildRemoteControlActions(initial), () => buildRemoteControlActions(initial)).actions[1];
        handle.unregister();
        remoteControlsRegistry.register('mod', { id: 'edit', edit: () => {} });
        expect(await invokeRemoteAction(old)).toBe(false); expect(run).not.toHaveBeenCalled();
    });
});
describe('remote activation tickets', () => {
    it('runs repeated counted reactions in the main renderer using refreshed tickets', async () => {
        const initial = source(); let count = 0;
        remoteControlsRegistry.register('mod', { id: 'edit', edit: event => { event.actions.push({ ...action('mod:vote', () => { count++; }), count }); } });
        const bridge = createRemoteControlActionBridge(() => initial, () => initial.snapshot.trackKey);
        for (let n = 0; n < 3; n++) {
            const snapshot = bridge.read()!;
            expect(snapshot.actions[1].count).toBe(n);
            expect(await bridge.activate(createRemoteActionActivation(snapshot, 'actions', snapshot.actions[1]))).toBe(true);
        }
        expect(count).toBe(3);
    });
    it('rejects stale song, same-song state refresh, malformed group, wrong handles, and disposed renderer', async () => {
        const initial = source(); const run = vi.fn(); let liveKey = initial.snapshot.trackKey;
        remoteControlsRegistry.register('mod', { id: 'edit', edit: event => { event.actions.push(action('mod:vote', run)); } });
        const bridge = createRemoteControlActionBridge(() => initial, () => liveKey);
        const ticket = () => { const snapshot = bridge.read()!; return createRemoteActionActivation(snapshot, 'actions', snapshot.actions[1]); };
        const old = ticket(); liveKey = 'song-b'; expect(await bridge.activate(old)).toBe(false);
        liveKey = 'song-a'; refreshRemoteControls(); expect(await bridge.activate(old)).toBe(false);
        expect(await bridge.activate({ ...ticket(), handle: 'wrong' })).toBe(false);
        expect(await bridge.activate({ ...ticket(), group: '__proto__' } as never)).toBe(false);
        const current = ticket(); bridge.dispose(); expect(await bridge.activate(current)).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });
    it('does not create extension descriptions without an active editor and restores defaults on unload', () => {
        const initial = source(); const bridge = createRemoteControlActionBridge(() => initial, () => initial.snapshot.trackKey);
        expect(bridge.read()).toBeUndefined();
        const handle = remoteControlsRegistry.register('mod', { id: 'edit', edit: event => { event.transport.length = 0; } });
        expect(bridge.read()?.transport).toEqual([]); handle.unregister(); expect(bridge.read()).toBeUndefined();
    });
    it('checks the latest host guard at activation rather than only the displayed descriptor', async () => {
        const initial = source(); remoteControlsRegistry.register('mod', { id: 'edit', edit: () => {} });
        const bridge = createRemoteControlActionBridge(() => initial, () => initial.snapshot.trackKey);
        const snapshot = bridge.read()!; const ticket = createRemoteActionActivation(snapshot, 'transport', snapshot.transport[2]);
        initial.snapshot.canGoNext = false;
        expect(await bridge.activate(ticket)).toBe(false); expect(initial.runNative).not.toHaveBeenCalled();
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    acquireExternalPlayback, releaseExternalPlayback, routeExternalPlayback, runExternalPlaybackCommand,
    hasExternalPlayback, externalPlaybackRevision, subscribeExternalPlayback,
} from '@/services/externalPlaybackSession';

// test/unit/mod-system/externalPlaybackSession.test.ts
let token: symbol | undefined;
afterEach(() => { if (token) releaseExternalPlayback(token); token = undefined; });
describe('server-owned playback', () => {
    it('keeps native next and natural end separate and never falls through when the owner throws', () => {
        const dispatch = vi.fn(() => { throw new Error('offline'); });
        token = acquireExternalPlayback(dispatch);
        expect(routeExternalPlayback({ type: 'next' })).toBe(true);
        expect(routeExternalPlayback({ type: 'ended' })).toBe(true);
        expect(dispatch.mock.calls.map(call => (call as unknown as [{ type: string }])[0].type)).toEqual(['next', 'ended']);
    });
    it('only allows the current lease to seek locally and rejects a stale lease after release', () => {
        const dispatch = vi.fn();
        token = acquireExternalPlayback(dispatch);
        expect(runExternalPlaybackCommand(token, () => routeExternalPlayback({ type: 'seek', seconds: 42 }))).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
        const stale = token;
        releaseExternalPlayback(token);
        expect(routeExternalPlayback({ type: 'select', song: {} as never }, stale)).toBe(true);
        expect(() => runExternalPlaybackCommand(stale, () => {})).toThrow('会话已结束');
    });
    it('invalidates in-flight local loads and notifies the app when loop and automix must change', () => {
        const before = externalPlaybackRevision();
        const changed = vi.fn();
        const stop = subscribeExternalPlayback(changed);
        token = acquireExternalPlayback(() => {});
        expect(hasExternalPlayback()).toBe(true);
        expect(externalPlaybackRevision()).not.toBe(before);
        expect(() => acquireExternalPlayback(() => {})).toThrow('另一个插件');
        releaseExternalPlayback(token);
        expect(hasExternalPlayback()).toBe(false);
        expect(changed).toHaveBeenCalledTimes(2);
        expect(routeExternalPlayback({ type: 'next' })).toBe(false);
        stop();
    });
});

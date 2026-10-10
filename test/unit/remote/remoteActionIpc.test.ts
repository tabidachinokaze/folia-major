import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

// test/unit/remote/remoteActionIpc.test.ts
const require = createRequire(import.meta.url);
const { sanitizeRemoteControls, isCurrentRemoteAction } = require('../../../electron/remoteControlActions.cjs');
const value = () => ({ epoch: 'renderer-a', revision: 1, trackKey: 'song-a', transport: [], actions: [
    { id: 'mod:vote', handle: 'opaque', icon: 'thumbs-up', label: { en: 'Vote' }, count: 3, run: 'must not cross IPC' },
] });
const command = { type: 'remote-action', epoch: 'renderer-a', revision: 1, trackKey: 'song-a', group: 'actions', id: 'mod:vote', handle: 'opaque' };
describe('remote action IPC boundary', () => {
    it('projects only portable fields and validates current identity and availability', () => {
        const remoteControls = sanitizeRemoteControls(value());
        expect(remoteControls.actions[0].run).toBeUndefined();
        const snapshot = { trackKey: 'song-a', remoteControls };
        expect(isCurrentRemoteAction(command, snapshot)).toBe(true);
        for (const change of [{ epoch: 'old' }, { revision: 0 }, { trackKey: 'song-b' }, { handle: 'wrong' }, { group: '__proto__' }]) {
            expect(isCurrentRemoteAction({ ...command, ...change }, snapshot)).toBe(false);
        }
        expect(isCurrentRemoteAction(command, { ...snapshot, trackKey: 'song-b' })).toBe(false);
        remoteControls.actions[0].disabled = true; expect(isCurrentRemoteAction(command, snapshot)).toBe(false);
    });
    it('rejects malformed, duplicate and excessive descriptors', () => {
        const invalid = value(); invalid.actions.push(invalid.actions[0]); expect(sanitizeRemoteControls(invalid)).toBeUndefined();
        expect(sanitizeRemoteControls({ ...value(), revision: Infinity })).toBeUndefined();
        expect(sanitizeRemoteControls({ ...value(), actions: Array(33).fill(value().actions[0]) })).toBeUndefined();
        expect(sanitizeRemoteControls({ ...value(), actions: [{ ...value().actions[0], count: -1 }] })).toBeUndefined();
    });
});

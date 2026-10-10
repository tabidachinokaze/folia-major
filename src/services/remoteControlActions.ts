import type { FoliumRemoteAction, FoliumRemoteControlsEvent, FoliumSong } from '@/mods/folium/contract';
import { getRemoteControlsRevision, invokeRemoteAction, remoteControlsRegistry, resolveRemoteControls } from '@/mods/folium/registries/remoteControls';
import type { RemoteActionActivation, RemoteActionDescription, RemoteControlsSnapshot, RemoteControlCommand, RemoteControlSnapshot } from '@/types/remoteControl';
import { PlayerState } from '@/types';

// src/services/remoteControlActions.ts
// Callback ownership and activation tickets belong to one main-renderer lifetime.
export interface RemoteActionSource {
    snapshot: RemoteControlSnapshot;
    song: FoliumSong | null;
    runNative(command: RemoteControlCommand): void;
    t(key: string, values?: Record<string, unknown>): string;
}
export function buildRemoteControlActions(source: RemoteActionSource): FoliumRemoteControlsEvent {
    const { snapshot: state, t, runNative } = source;
    const disabled = state.controlsDisabled || !state.hasTrack;
    const button = (id: string, key: string, icon: string, command: RemoteControlCommand, unavailable = disabled): FoliumRemoteAction => ({
        id: `host:${id}`, label: { en: t(key) }, icon, disabled: unavailable, run: () => runNative(command),
    });
    return {
        context: {
            song: source.song,
            state: state.playerState === PlayerState.PLAYING ? 'playing' : state.playerState === PlayerState.PAUSED ? 'paused' : 'stopped',
            controlsDisabled: state.controlsDisabled,
            canPrevious: state.canGoPrevious,
            canNext: state.canGoNext,
        },
        transport: [
            button('previous', 'remote.previous', 'skip-back', { type: 'previous' }, disabled || !state.canGoPrevious),
            { ...button('play-pause', state.playerState === PlayerState.PLAYING ? 'remote.pause' : 'remote.play',
                state.playerState === PlayerState.PLAYING ? 'pause' : 'play', { type: 'play-pause' }), primary: true },
            button('next', 'remote.next', 'skip-forward', { type: 'next' }, disabled || !state.canGoNext),
            { ...button('loop', state.loopMode === 'off' ? 'remote.loopOff' : state.loopMode === 'one' ? 'remote.loopOne' : 'remote.loopAll',
                state.loopMode === 'off' ? 'repeat-off' : state.loopMode === 'one' ? 'repeat-1' : 'repeat', { type: 'cycle-loop-mode' }), pressed: state.loopMode !== 'off' },
        ],
        actions: [{
            ...button('like', state.isLiked ? 'remote.unlike' : 'remote.like', 'heart', { type: 'toggle-like' }, disabled || state.canLike === false),
            label: { en: state.likeUnavailableProvider ? t('status.providerLikeUnavailable', { provider: state.likeUnavailableProvider }) : t(state.isLiked ? 'remote.unlike' : 'remote.like') },
            pressed: state.isLiked, tone: 'alert',
        }],
    };
}
const describe = (item: FoliumRemoteAction, handle: string): RemoteActionDescription => ({
    id: item.id, handle, label: { ...item.label }, icon: item.icon, disabled: item.disabled,
    pressed: item.pressed, primary: item.primary, tone: item.tone, count: item.count,
});

/** Re-resolve before every activation; a previous song or registration cannot reactivate. */
export function createRemoteControlActionBridge(readSource: () => RemoteActionSource, liveTrackKey: () => string | null) {
    const epoch = crypto.randomUUID();
    let signature = '', revision = 0, disposed = false;
    let snapshot: RemoteControlsSnapshot | undefined;
    let resolved: FoliumRemoteControlsEvent | undefined;
    const read = () => {
        if (disposed || remoteControlsRegistry.list().length === 0) {
            signature = '';
            resolved = undefined;
            snapshot = undefined;
            return undefined;
        }
        const source = readSource();
        resolved = resolveRemoteControls(buildRemoteControlActions(source), () => buildRemoteControlActions(readSource()));
        const descriptions = { transport: resolved.transport.map(item => describe(item, '')), actions: resolved.actions.map(item => describe(item, '')) };
        const nextSignature = JSON.stringify([source.snapshot.trackKey, getRemoteControlsRevision(), descriptions]);
        if (nextSignature !== signature) {
            signature = nextSignature;
            snapshot = { epoch, revision: ++revision, trackKey: source.snapshot.trackKey,
                transport: resolved.transport.map(item => describe(item, crypto.randomUUID())),
                actions: resolved.actions.map(item => describe(item, crypto.randomUUID())),
            };
        }
        return snapshot;
    };
    return {
        read,
        async activate(command: RemoteActionActivation) {
            if (command.group !== 'transport' && command.group !== 'actions') return false;
            const current = read();
            if (!current || command.epoch !== epoch || command.revision !== current.revision
                || command.trackKey !== current.trackKey || current.trackKey !== liveTrackKey()) return false;
            const position = current[command.group]?.findIndex(item => item.id === command.id && item.handle === command.handle);
            const item = position !== undefined && position >= 0 ? resolved?.[command.group]?.[position] : undefined;
            return item ? invokeRemoteAction(item) : false;
        },
        dispose() { disposed = true; signature = ''; snapshot = undefined; resolved = undefined; },
    };
}

export const createRemoteActionActivation = (snapshot: RemoteControlsSnapshot, group: 'transport' | 'actions', item: RemoteActionDescription): RemoteActionActivation => ({
    type: 'remote-action', epoch: snapshot.epoch, revision: snapshot.revision, trackKey: snapshot.trackKey,
    group, id: item.id, handle: item.handle,
});

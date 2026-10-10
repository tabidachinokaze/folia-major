import React, { useEffect, useState } from 'react';
import RemoteControlApp from '../../src/components/remote/RemoteControlApp';
import { PlayerState } from '../../src/types';
import { idleVideoExportState } from '../../src/types/videoExport';
import type { RemoteControlSnapshot } from '../../src/types/remoteControl';
import { remoteControlsRegistry, subscribeRemoteControls, refreshRemoteControls } from '../../src/mods/folium/registries/remoteControls';
import { createRemoteControlActionBridge } from '../../src/services/remoteControlActions';
import type { ProbeDefinition } from './definition';

// dev/probes/remoteControls.probe.tsx
// Real remote UI, with an in-memory transport standing in for Electron IPC.
function RemoteControlsProbe() {
    const [ready, setReady] = useState(false);
    const [commands, setCommands] = useState<string[]>([]);
    useEffect(() => {
        let count = 0, enabled = false, movePrevious = false, removePrevious = false;
        let handle: ReturnType<typeof remoteControlsRegistry.register> | null = null;
        const state: RemoteControlSnapshot = {
            hasTrack: true, trackKey: 'probe:a', title: 'Remote action demo', artist: 'Offline fixture', coverUrl: null,
            currentTime: 12, duration: 180, playerState: PlayerState.PLAYING, loopMode: 'off',
            canGoPrevious: true, canGoNext: true, prevTrackKey: 'probe:previous', prevTrackTitle: 'Previous preview', prevTrackArtist: 'Offline fixture',
            prevTrackCoverUrl: null, nextTrackKey: null, nextTrackTitle: null, nextTrackArtist: null, nextTrackCoverUrl: null,
            trackTransition: null, controlsDisabled: false, isStageActive: false, transparentModeEnabled: false,
            mainWindowClickThroughEnabled: false, mainWindowAlwaysOnTop: false, mainWindowBorderVisible: false,
            playerChromeHidden: false, playerChromeVisibilityMode: 'auto-hide', exportState: idleVideoExportState(),
            isDaylight: false, isLiked: false, canLike: true, updatedAt: 0,
        };
        const log = (value: string) => setCommands(items => [...items, value]);
        const native = (command: { type: string }) => {
            log(command.type);
            if (command.type === 'toggle-like') state.isLiked = !state.isLiked;
            publish();
        };
        const bridge = createRemoteControlActionBridge(() => ({ snapshot: state, song: null, runNative: native, t: key => key }), () => state.trackKey);
        let listener: ((snapshot: RemoteControlSnapshot) => void) | undefined;
        const current = () => ({ ...state, remoteControls: bridge.read() });
        const publish = () => listener?.(current());
        const previous = window.electron;
        window.electron = {
            getRemoteControlSnapshot: async () => current(),
            onRemoteControlSnapshot: callback => { listener = callback; return () => { listener = undefined; }; },
            sendRemoteControlCommand: async command => {
                if (command.type === 'remote-action') return bridge.activate(command);
                native(command); return true;
            },
        } as NonNullable<typeof window.electron>;
        const remove = subscribeRemoteControls(publish);
        const control = (event: Event) => {
            const action = (event.target as HTMLElement).dataset.remoteDemo;
            if (action === 'toggle') {
                enabled = !enabled;
                if (enabled) handle = remoteControlsRegistry.register('remote-probe', { id: 'buttons', edit: event => {
                    event.transport = event.transport.filter(item => item.id !== 'host:loop');
                    event.transport.reverse();
                    const previous = event.transport.find(item => item.id === 'host:previous');
                    if (movePrevious || removePrevious) event.transport = event.transport.filter(item => item !== previous);
                    if (movePrevious && !removePrevious && previous) event.actions.push(previous);
                    event.actions.unshift({ id: 'remote-probe:vote', label: { en: 'Room vote' }, icon: 'thumbs-up', count,
                        run: () => { count++; log(`vote:${count}`); } });
                } });
                else { handle?.unregister(); handle = null; }
            } else if (action === 'move') { movePrevious = !movePrevious; refreshRemoteControls(); }
            else if (action === 'remove') { removePrevious = !removePrevious; refreshRemoteControls(); }
            else if (action === 'track') { state.trackKey = state.trackKey === 'probe:a' ? 'probe:b' : 'probe:a'; refreshRemoteControls(); }
            else if (action === 'disabled') { state.controlsDisabled = !state.controlsDisabled; refreshRemoteControls(); }
        };
        document.addEventListener('click', control);
        setReady(true);
        return () => {
            document.removeEventListener('click', control); remove(); handle?.unregister(); bridge.dispose(); window.electron = previous;
        };
    }, []);
    return <div className="p-8 text-white bg-zinc-900 min-h-screen">
        <div className="flex gap-4 mb-8">
            <button data-remote-demo="toggle">Toggle mod</button><button data-remote-demo="track">Change track</button>
            <button data-remote-demo="disabled">Disable native actions</button>
            <button data-remote-demo="move">Move previous</button><button data-remote-demo="remove">Remove previous</button>
        </div>
        <div data-testid="remote-window" className="w-[460px] h-[225px]">{ready && <RemoteControlApp />}</div>
        <output data-testid="remote-log">{commands.join(', ')}</output>
    </div>;
}
export default { id: 'remoteControls', title: 'Remote action lists',
    description: 'Native fallback, reorder, room reactions, IPC tickets and owner teardown without an account.', Component: RemoteControlsProbe } satisfies ProbeDefinition;

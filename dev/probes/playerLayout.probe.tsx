import React, { useEffect, useRef, useState } from 'react';
import { motionValue } from 'framer-motion';
import AppShell from '../../src/components/app/AppShell';
import AppDialogs from '../../src/components/app/dialogs/AppDialogs';
import VisualizerShell from '../../src/components/visualizer/VisualizerShell';
import FloatingPlayerControls from '../../src/components/FloatingPlayerControls';
import NowPlayingToast from '../../src/components/app/overlays/NowPlayingToast';
import { usePlayerOverlayObstacle } from '../../src/hooks/usePlayerOverlayLayout';
import { playerOverlayLayout } from '../../src/services/playerOverlayLayout';
import { useFoliumStageContext } from '../../src/mods/folium/stageContext';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { playerBottomBarLiveOffset } from '../../src/stores/motionSignals';
import { PlayerState } from '../../src/types';
import { mountPlayerLayoutDemo } from '../folium/player-layout-demo/client.mjs';
import type { ProbeDefinition } from './definition';

// dev/probes/playerLayout.probe.tsx
// Real native controls and a public-context-only mod exercise pointer reveal and animated geometry.

const clock = motionValue(42);
const power = motionValue(0);
const bands = { bass: power, lowMid: power, mid: power, vocal: power, treble: power, high: power };
const noop = () => {};

const DemoLayer: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);
    const ctx = useFoliumStageContext({
        lines: [], currentTime: clock, currentLineIndex: -1, paused: true,
        theme: DEFAULT_THEME, isDaylight: false, songTitle: null, songArtist: null,
        songAlbum: null, staticMode: false, seed: null, isPreview: false, coverUrl: null,
        display: {}, surface: { transparent: false, hostBackground: true }, settings: null,
        layout: playerOverlayLayout.source,
    });
    useEffect(() => ref.current ? mountPlayerLayoutDemo(ref.current, ctx) : undefined, [ctx]);
    return <div ref={ref} data-probe-demo className="absolute inset-0 pointer-events-none z-[1000]" />;
};

const PlayerLayoutProbe: React.FC = () => {
    const [active, setActive] = useState(true);
    const [backHits, setBackHits] = useState(0);
    const [cardHits, setCardHits] = useState(0);
    const [panel, setPanel] = useState(false);
    const [toast, setToast] = useState(false);
    const [toastVersion, setToastVersion] = useState(0);
    const [hidden, setHidden] = useState(false);
    const [staticVisuals, setStaticVisuals] = useState(false);
    const { ref: panelRef } = usePlayerOverlayObstacle('player-panel');
    useEffect(() => () => playerBottomBarLiveOffset.set(32), []);
    return <>
        <AppShell appStyle={{ background: '#171321' }} isElectronWindow={false}
            hideFullscreenButton={false} usesCustomWindowChrome useCustomWindowRadius={false}
            showTransparentWindowBorder={false} isPlayerView={active} isTitlebarRevealed
            alwaysShowMainWindowTitlebar={false} isMainWindowClickThroughEnabled={false}
            showMainWindowClickThroughToggle={false} onToggleMainWindowClickThrough={noop}
            isDaylight={false} audioElement={null}>
            <div data-probe-layout data-back-hits={backHits} data-card-hits={cardHits} className="absolute inset-0">
                <VisualizerShell theme={DEFAULT_THEME} audioPower={power} audioBands={bands}
                    renderBackground={false} sharedProps={{ onBack: () => setBackHits(v => v + 1), isPanelOpen: panel, staticMode: staticVisuals }}>
                    <div className="text-white/30">Native player layout</div>
                </VisualizerShell>
                <FloatingPlayerControls currentSong={{ name: 'Layout probe' }} playerState={PlayerState.PLAYING}
                    currentTime={clock} duration={180} loopMode="all" currentView="player" audioSrc={null}
                    canTogglePlay lyrics={null} onSeek={noop} onTogglePlay={noop} onToggleLoop={noop}
                    onNavigateToPlayer={noop} isDaylight={false} isHidden={hidden}
                    slotPrimary="loop" slotSecondary="lyrics-timeline" slotContext={{
                        onShuffle: noop, canShuffle: true, onLike: noop, isLiked: false, likeDisabled: false,
                        invokeCommandById: noop, canInvokeCommandById: () => true,
                    }} onCommitBottomBarOffset={noop} />
                <NowPlayingToast song={{ title: 'Native song card', artist: 'Probe', coverUrl: null }}
                    trackKey="probe" mode="always" isDaylight={false} onActivate={() => setCardHits(v => v + 1)}
                    activateLabel="Activate native card" />
                {panel && <div ref={panelRef} data-probe-panel className="absolute right-8 top-24 bottom-24 w-80 bg-zinc-800 rounded-3xl z-60" />}
                <DemoLayer />
            </div>
        </AppShell>
        <AppDialogs model={{ statusToast: toast ? { type: 'success', text: `Native status toast ${toastVersion}`, toastKey: `probe-${toastVersion}`, isDaylight: false } : null }} />
        <div className="fixed left-1/2 -translate-x-1/2 top-40 z-[11000] flex flex-wrap gap-2 text-white text-xs">
            <button data-probe-action="panel" onClick={() => setPanel(v => !v)}>Toggle panel</button>
            <button data-probe-action="toast" onClick={() => setToast(v => !v)}>Toggle toast</button>
            <button data-probe-action="replace-toast" onClick={() => setToastVersion(v => v + 1)}>Replace toast</button>
            <button data-probe-action="lift" onClick={() => playerBottomBarLiveOffset.set(120)}>Lift bottom bar</button>
            <button data-probe-action="chrome" onClick={() => setHidden(v => !v)}>Toggle chrome</button>
            <button data-probe-action="static" onClick={() => setStaticVisuals(v => !v)}>Toggle static visuals</button>
            <button data-probe-action="page" onClick={() => setActive(v => !v)}>Toggle player page</button>
        </div>
    </>;
};

const definition: ProbeDefinition = {
    id: 'playerLayout', title: '播放器覆盖层 · 公开几何与控件避让',
    description: '示例模组只通过 getLayout 定位，检查隐藏返回按钮唤出、侧栏、卡片、Toast、底栏移动和页面切换。',
    Component: PlayerLayoutProbe,
};
export default definition;

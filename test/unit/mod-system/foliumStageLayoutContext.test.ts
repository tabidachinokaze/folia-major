// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFoliumStageContext, type FoliumStageInputs } from '@/mods/folium/stageContext';
import type { FoliumPlayerLayout, FoliumStageContext } from '@/mods/folium/contract';
import { DEFAULT_THEME } from '@/services/baseThemes';

// test/unit/mod-system/foliumStageLayoutContext.test.ts
// Layout changes reuse the existing subscription without remounting lyric-synced content.

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
const inputs = (): FoliumStageInputs => ({
    lines: [], currentTime: motionValue(0), currentLineIndex: -1, paused: true,
    theme: DEFAULT_THEME, isDaylight: false, songTitle: null, songArtist: null, songAlbum: null,
    staticMode: false, seed: null, isPreview: false, coverUrl: null, display: {},
    surface: { transparent: false, hostBackground: true }, settings: null,
});

describe('stage layout context', () => {
    it('passes layout notifications through subscribe and cleans up both channels', () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        let ctx!: FoliumStageContext;
        let layoutListener: (() => void) | undefined;
        const off = vi.fn();
        const initial = inputs();
        let layout: FoliumPlayerLayout = Object.freeze({ bounds: Object.freeze({ left: 0, top: 0, width: 500, height: 400 }), obstacles: Object.freeze([]) });
        initial.layout = { get: () => layout, subscribe: listener => { layoutListener = listener; return off; } };
        function Probe({ values }: { values: FoliumStageInputs }) { ctx = useFoliumStageContext(values); return null; }
        const node = document.createElement('div');
        document.body.append(node);
        const root = createRoot(node);
        act(() => root.render(React.createElement(Probe, { values: initial })));
        const firstContext = ctx;
        const listener = vi.fn();
        const unsubscribe = ctx.subscribe(listener);
        expect(ctx.getLayout()).toBe(layout);
        layout = Object.freeze({ ...layout, bounds: Object.freeze({ ...layout.bounds, width: 600 }) });
        layoutListener!();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(ctx.getLayout()).toBe(layout);
        act(() => root.render(React.createElement(Probe, { values: { ...initial, paused: false } })));
        expect(ctx).toBe(firstContext);
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe(); unsubscribe();
        expect(off).toHaveBeenCalledTimes(1);
        act(() => root.render(React.createElement(Probe, { values: initial })));
        expect(listener).toHaveBeenCalledTimes(2);
        act(() => root.unmount());
    });
    it.each(['preview', 'static', 'without-layout'] as const)('returns null in %s content', (mode) => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        let ctx!: FoliumStageContext;
        const values = inputs();
        values.isPreview = mode === 'preview';
        values.staticMode = mode === 'static';
        if (mode !== 'without-layout') values.layout = {
            get: () => ({ bounds: { left: 0, top: 0, width: 500, height: 400 }, obstacles: [] }),
            subscribe: () => () => {},
        };
        function Probe() { ctx = useFoliumStageContext(values); return null; }
        const node = document.createElement('div');
        document.body.append(node);
        const root = createRoot(node);
        act(() => root.render(React.createElement(Probe)));
        expect(ctx.getLayout()).toBeNull();
        act(() => root.unmount());
    });
});

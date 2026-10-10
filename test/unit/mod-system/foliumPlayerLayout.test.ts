// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerOverlayLayout } from '@/services/playerOverlayLayout';
import { freezePlayerLayout } from '@/utils/playerOverlayGeometry';

// test/unit/mod-system/foliumPlayerLayout.test.ts
// Verify the shared measurement channel without observing or querying arbitrary native DOM.

const bounds = { left: 0, top: 0, width: 1000, height: 600 };
const resizeCallbacks: (() => void)[] = [];
const disconnect = vi.fn();
beforeEach(() => {
    vi.useFakeTimers();
    resizeCallbacks.length = 0;
    disconnect.mockClear();
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) { resizeCallbacks.push(callback); }
        observe() {}
        disconnect = disconnect;
    });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

const elementAt = (rect = bounds) => {
    const element = document.createElement('div');
    document.body.append(element);
    const read = vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => new DOMRect(rect.left, rect.top, rect.width, rect.height));
    return { element, read };
};

describe('player layout snapshots', () => {
    it('merges overlapping keyed instances under a stable native obstacle id', () => {
        const value = freezePlayerLayout(bounds, [10, 50].map(left => ({
            id: 'status-toast', kind: 'control', rect: { left, top: 30, width: 100, height: 40 },
        })));
        expect(value.obstacles).toHaveLength(1);
        expect(value.obstacles[0].rect).toEqual({ left: 10, top: 30, width: 140, height: 40 });
    });
    it('projects DOMRect properties explicitly and deeply freezes the result', () => {
        const value = freezePlayerLayout(new DOMRect(20, 30, 400, 250), [{
            id: 'control', kind: 'control', rect: { left: 0, top: 0, width: 70, height: 90 },
        }]);
        expect(value.bounds).toEqual({ left: 20, top: 30, width: 400, height: 250 });
        expect(value.obstacles[0].rect).toEqual({ left: 20, top: 30, width: 50, height: 60 });
        expect([value, value.bounds, value.obstacles, value.obstacles[0], value.obstacles[0].rect].every(Object.isFrozen)).toBe(true);
    });
    it('drops invalid, outside and zero-area obstacles', () => {
        const value = freezePlayerLayout(bounds, [NaN, 1100, 0].map((left, index) => ({
            id: String(index), kind: 'control', rect: { left, top: 20, width: index === 2 ? 0 : 20, height: 20 },
        })));
        expect(value.obstacles).toEqual([]);
    });
    it('returns null without a live player root and immediately after it is removed', () => {
        const layout = createPlayerOverlayLayout();
        expect(layout.source.get()).toBeNull();
        const root = elementAt();
        const offRoot = layout.registerRoot(root.element);
        expect(layout.source.get()?.bounds).toEqual(bounds);
        const off = layout.source.subscribe(() => {});
        offRoot();
        expect(layout.source.get()).toBeNull();
        off();
    });
    it('keeps the same snapshot when measurements are unchanged', () => {
        const layout = createPlayerOverlayLayout();
        layout.registerRoot(elementAt().element);
        const value = layout.source.get();
        const listener = vi.fn();
        const off = layout.source.subscribe(listener);
        for (let i = 0; i < 10; i++) layout.invalidate();
        vi.advanceTimersByTime(80);
        expect(layout.source.get()).toBe(value);
        expect(listener).not.toHaveBeenCalled();
        off();
    });
    it('coalesces animation updates for all subscribers and stays idle afterward', () => {
        const layout = createPlayerOverlayLayout();
        const root = elementAt();
        layout.registerRoot(root.element);
        layout.source.get();
        const listeners = [vi.fn(), vi.fn()];
        const offs = listeners.map(layout.source.subscribe);
        expect(resizeCallbacks).toHaveLength(1);
        root.read.mockClear();
        let top = 500;
        layout.register(null, () => ({ id: 'bar', kind: 'control', rect: { left: 50, top, width: 100, height: 50 } }));
        for (let i = 0; i < 120; i++) { top--; layout.invalidate(); }
        expect(root.read).not.toHaveBeenCalled();
        vi.advanceTimersByTime(80);
        expect(root.read).toHaveBeenCalledTimes(1);
        listeners.forEach(listener => expect(listener).toHaveBeenCalledTimes(1));
        vi.advanceTimersByTime(60_000);
        expect(root.read).toHaveBeenCalledTimes(1);
        offs.forEach(off => off());
    });
    it('a getter while a update is queued does not consume another subscriber notification', () => {
        const layout = createPlayerOverlayLayout();
        layout.registerRoot(elementAt().element);
        const before = layout.source.get();
        const listener = vi.fn();
        const off = layout.source.subscribe(listener);
        layout.register(null, () => ({ id: 'back-reveal', kind: 'reveal-area', rect: { ...bounds, width: 120, height: 120 } }));
        expect(layout.source.get()).toBe(before);
        vi.advanceTimersByTime(80);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(layout.source.get()?.obstacles[0].kind).toBe('reveal-area');
        off();
    });
    it('cleans timers and observers when the last subscription ends, and reconnects later', () => {
        const layout = createPlayerOverlayLayout();
        layout.registerRoot(elementAt().element);
        const off = layout.source.subscribe(() => {});
        const before = disconnect.mock.calls.length;
        off(); off();
        expect(disconnect.mock.calls.length).toBe(before + 1);
        expect(vi.getTimerCount()).toBe(0);
        const offAgain = layout.source.subscribe(() => {});
        expect(resizeCallbacks).toHaveLength(2);
        offAgain();
    });
    it('unregisters native obstacles without removing independent reveal regions', () => {
        const layout = createPlayerOverlayLayout();
        layout.registerRoot(elementAt().element);
        layout.register(null, () => ({ id: 'back-reveal', kind: 'reveal-area', rect: { ...bounds, width: 120, height: 120 } }));
        const offControl = layout.register(null, () => ({ id: 'back', kind: 'control', rect: { left: 24, top: 24, width: 40, height: 40 } }));
        expect(layout.source.get()?.obstacles).toHaveLength(2);
        offControl();
        expect(layout.source.get()?.obstacles.map(item => item.id)).toEqual(['back-reveal']);
    });
});

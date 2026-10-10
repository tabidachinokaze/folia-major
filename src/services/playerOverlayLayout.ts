import type { FoliumLayoutRect, FoliumPlayerLayout, FoliumPlayerObstacle } from '../mods/folium/contract';
import { freezePlayerLayout, samePlayerLayout } from '../utils/playerOverlayGeometry';

// src/services/playerOverlayLayout.ts
// Native components register their own refs; mods only receive immutable geometry.

type ObstacleReader = (bounds: FoliumLayoutRect) => FoliumPlayerObstacle | null;
type Entry = { element: Element | null; read: ObstacleReader };
export interface PlayerLayoutSource {
    get(): FoliumPlayerLayout | null;
    subscribe(listener: () => void): () => void;
}

export const createPlayerOverlayLayout = () => {
    let root: Element | null = null;
    let snapshot: FoliumPlayerLayout | null = null;
    let dirty = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    const entries = new Map<symbol, Entry>();
    const listeners = new Set<() => void>();

    const measure = () => {
        dirty = false;
        const bounds = root?.isConnected ? root.getBoundingClientRect() : null;
        const next = bounds && bounds.width > 0 && bounds.height > 0
            ? freezePlayerLayout(bounds, [...entries.values()].flatMap(({ read }) => {
                const obstacle = read(bounds);
                return obstacle ? [obstacle] : [];
            }))
            : null;
        if (samePlayerLayout(snapshot, next)) return false;
        snapshot = next;
        return true;
    };
    const notify = () => {
        if (!measure()) return;
        for (const listener of [...listeners]) {
            try { listener(); } catch (error) { console.warn('[Folium] layout subscriber failed', error); }
        }
    };
    // Motion callbacks invalidate the layout, but neither measure nor update React every frame.
    const invalidate = () => {
        dirty = true;
        if (!listeners.size || timer !== undefined) return;
        timer = setTimeout(() => { timer = undefined; notify(); }, 80);
    };
    const observeEntries = () => {
        observer?.disconnect();
        if (root) observer?.observe(root);
        for (const entry of entries.values()) if (entry.element) observer?.observe(entry.element);
    };
    const source: PlayerLayoutSource = {
        get: () => {
            if (!root?.isConnected) return null;
            if (dirty && !listeners.size) measure();
            return snapshot;
        },
        subscribe: (listener) => {
            if (!listeners.size) {
                if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(invalidate);
                observeEntries();
                window.addEventListener('resize', invalidate);
                window.addEventListener('scroll', invalidate, true);
            }
            listeners.add(listener);
            invalidate();
            let disposed = false;
            return () => {
                if (disposed) return;
                disposed = true;
                listeners.delete(listener);
                if (!listeners.size) {
                    clearTimeout(timer);
                    timer = undefined;
                    observer?.disconnect();
                    observer = undefined;
                    window.removeEventListener('resize', invalidate);
                    window.removeEventListener('scroll', invalidate, true);
                }
            };
        },
    };
    return {
        source,
        invalidate,
        registerRoot: (element: Element) => {
            root = element;
            observeEntries();
            invalidate();
            return () => {
                if (root === element) root = null;
                observeEntries();
                invalidate();
            };
        },
        register: (element: Element | null, read: ObstacleReader) => {
            const token = Symbol();
            entries.set(token, { element, read });
            observeEntries();
            invalidate();
            return () => {
                entries.delete(token);
                observeEntries();
                invalidate();
            };
        },
    };
};

export const playerOverlayLayout = createPlayerOverlayLayout();

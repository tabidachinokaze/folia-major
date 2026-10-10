import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { FoliumLayoutRect } from '../mods/folium/contract';
import { playerOverlayLayout } from '../services/playerOverlayLayout';
import { isMainAppSurface } from '../utils/appSurface';

// src/hooks/usePlayerOverlayLayout.ts
// Each native control owns its geometry registration and its cleanup.

export const usePlayerOverlayRoot = (ref: RefObject<HTMLElement | null>, active: boolean) => {
    useLayoutEffect(() => {
        if (!active || !isMainAppSurface || !ref.current) return;
        return playerOverlayLayout.registerRoot(ref.current);
    }, [ref, active]);
};

export const usePlayerOverlayObstacle = (
    id: string,
    enabled = true,
) => {
    const elementRef = useRef<HTMLElement | null>(null);
    const disposeRef = useRef<(() => void) | undefined>(undefined);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const register = useCallback(() => {
        const element = elementRef.current;
        if (!element || disposeRef.current) return;
        disposeRef.current = playerOverlayLayout.register(element, () => element.isConnected && enabledRef.current
            ? { id, kind: 'control', rect: element.getBoundingClientRect() }
            : null);
    }, [id]);
    const dispose = useCallback(() => { disposeRef.current?.(); disposeRef.current = undefined; }, []);
    // Callback refs retain AnimatePresence exits until the node actually unmounts.
    const ref = useCallback((element: HTMLElement | null) => {
        dispose();
        elementRef.current = element;
        register();
    }, [register, dispose]);
    useLayoutEffect(() => { register(); return dispose; }, [register, dispose]);
    useLayoutEffect(playerOverlayLayout.invalidate, [enabled]);
    return { ref, invalidate: playerOverlayLayout.invalidate };
};

export const usePlayerOverlayReservation = (
    id: string,
    read: (bounds: FoliumLayoutRect) => FoliumLayoutRect,
    enabled = true,
) => {
    useLayoutEffect(() => {
        if (!enabled) return;
        return playerOverlayLayout.register(null, (bounds) => ({ id, kind: 'reveal-area', rect: read(bounds) }));
    }, [id, read, enabled]);
};

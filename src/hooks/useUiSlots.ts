import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { getUiSlotRevision, resolveUiSlots, subscribeUiSlots } from '@/mods/folium/uiSlots';
import type { FoliumUiSlotContext, FoliumUiSlotItem } from '@/mods/folium/contract';

// src/hooks/useUiSlots.ts
// Subscribe to discrete slot changes without subscribing to the playback clock.
export function useUiSlots(target: string, defaults: Record<string, FoliumUiSlotItem[]>, context: FoliumUiSlotContext) {
    const subscribe = useCallback((listener: () => void) => subscribeUiSlots(target, listener), [target]);
    const snapshot = useCallback(() => getUiSlotRevision(target, context.entityId), [target, context.entityId]);
    useSyncExternalStore(subscribe, snapshot, snapshot);
    const committed = useRef({ target, defaults, context, mounted: false });
    useLayoutEffect(() => { committed.current = { target, defaults, context, mounted: true }; });
    useLayoutEffect(() => () => { committed.current.mounted = false; }, []);
    return resolveUiSlots(target, defaults, context, () => {
        const latest = committed.current;
        return latest.mounted && latest.target === target && latest.context.surface === context.surface
            && latest.context.entityId === context.entityId ? latest : undefined;
    });
}

// src/mods/folium/uiSlotInvalidation.ts
// Revisions change only for registrations or explicitly announced discrete state.
const revisions = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
export const getUiSlotRevision = (target: string, entityId?: string) =>
    (revisions.get(target) ?? 0) + (entityId ? revisions.get(`${target}\0${entityId}`) ?? 0 : 0);
export const subscribeUiSlots = (target: string, listener: () => void) => {
    const current = listeners.get(target) ?? new Set<() => void>();
    current.add(listener);
    listeners.set(target, current);
    return () => { current.delete(listener); if (!current.size) listeners.delete(target); };
};
export function invalidateUiSlots(target?: string, entityId?: string) {
    const targets = target ? [target] : [...listeners.keys()];
    for (const name of targets) {
        const key = entityId ? `${name}\0${entityId}` : name;
        revisions.set(key, (revisions.get(key) ?? 0) + 1);
        listeners.get(name)?.forEach(listener => {
            try { listener(); } catch (error) { console.warn('[Folium] slot listener failed', error); }
        });
    }
}

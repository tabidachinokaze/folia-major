import { useSyncExternalStore } from 'react';
import type { SongResult } from '@/types';
import type { FoliumQueueViewDef } from '../contract';
import { createFoliumRegistry, type FoliumRegistryEntry } from '../registry';
import { createQueueViewAdapter, type QueueView } from '../queueViewAdapter';
import { reportFoliumIssue } from '../status';

// src/mods/folium/registries/queueViews.ts
// A presentation registration owns only its UI projection, never the private queue or audio.
let view: QueueView | null = null;
let serial = 0;
const listeners = new Set<() => void>();
const stops = new WeakMap<object, () => void>();
const publish = (next: QueueView | null) => {
    if (view === next) return;
    view = next;
    listeners.forEach(listener => { try { listener(); } catch (error) { console.warn('[Folium] queue view listener failed', error); } });
};
export const queueViewsRegistry = createFoliumRegistry<FoliumQueueViewDef>('queueViews', {
    validate(def) {
        if (typeof def.getSnapshot !== 'function' || typeof def.subscribe !== 'function' || typeof def.onAction !== 'function') throw new Error('invalid-queue-view-definition');
        return { ...def };
    },
    onAdd(entry) {
        if (view) throw new Error('queue-view-busy');
        const adapt = createQueueViewAdapter(entry, `queue-view:${++serial}`);
        const refresh = () => {
            if (queueViewsRegistry.get(entry.id) !== entry) return;
            try { publish(adapt(entry.def.getSnapshot())); }
            catch (error) { reportFoliumIssue(entry.modId, 'queue view', error); }
        };
        const initial = adapt(entry.def.getSnapshot());
        let stop: (() => void) | undefined;
        try {
            publish(initial);
            stop = entry.def.subscribe(refresh);
            if (typeof stop !== 'function') throw new Error('queue-view-subscription-disposer-required');
            stops.set(entry, stop);
        } catch (error) {
            try { if (typeof stop === 'function') stop(); }
            catch (disposeError) { reportFoliumIssue(entry.modId, 'queue view cleanup', disposeError); }
            finally { if ((view as QueueView | null)?.owner === entry) publish(null); }
            throw error;
        }
    },
    onRemove(entry) {
        try { stops.get(entry)?.(); } finally {
            stops.delete(entry);
            if ((view as QueueView | null)?.owner === entry) publish(null);
        }
    },
});
export const readQueueView = () => view;
export const subscribeQueueView = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useQueueView = () => useSyncExternalStore(subscribeQueueView, readQueueView, readQueueView);
/** Snapshot reread protects a delayed click from deletion, account change or teardown. */
export async function invokeQueueViewAction(owner: object, key: string | null, actionId: string) {
    const registration = owner as FoliumRegistryEntry<FoliumQueueViewDef>;
    if (view?.owner !== owner || queueViewsRegistry.get(registration.id) !== registration) return false;
    try {
        const latest = createQueueViewAdapter(owner, 'validation')(registration.def.getSnapshot());
        const entryId = key ? view.entries.get(key)?.id : null;
        if (key && !entryId) return false;
        const entry = entryId ? [...latest.entries.values()].find(item => item.id === entryId) : null;
        if (key && !entry) return false;
        const action = (entry?.actions ?? latest.actions).find(item => item.id === actionId);
        if (!action || action.disabled) return false;
        await registration.def.onAction({ entryId: entryId ?? null, actionId });
        return true;
    } catch (error) { reportFoliumIssue(registration.modId, 'queue action', error); return false; }
}
/** Presentation rows consume selection even after expiration, without falling through to audio. */
export function activateQueueViewSong(song: SongResult) {
    if (!song.queuePresentationId) return false;
    const current = view, entry = current?.entries.get(song.queuePresentationId);
    if (current && entry?.defaultAction) void invokeQueueViewAction(current.owner, song.queuePresentationId, entry.defaultAction);
    return true;
}

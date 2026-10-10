import type { FoliumRemoteAction, FoliumRemoteControlsDef, FoliumRemoteControlsEvent } from '../contract';
import { createFoliumRegistry, type FoliumRegistryEntry } from '../registry';
import { hasFoliumIcon } from '../icons';
import { reportFoliumIssue } from '../status';

// src/mods/folium/registries/remoteControls.ts
// Owned synchronous list edits; a failed contribution leaves the previous lists intact.
let revision = 0;
const listeners = new Set<() => void>();
export const refreshRemoteControls = () => {
    revision++;
    listeners.forEach(listener => {
        try { listener(); } catch (error) { console.warn('[Folium] remote controls listener failed', error); }
    });
};
export const getRemoteControlsRevision = () => revision;
export const subscribeRemoteControls = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
export const remoteControlsRegistry = createFoliumRegistry<FoliumRemoteControlsDef>('remoteControls', {
    validate(def) {
        if (typeof def.edit !== 'function' || (def.order !== undefined && !Number.isFinite(def.order))) {
            throw new Error('remoteControls.register: invalid editor or order');
        }
        return { ...def };
    },

});
// Notify after the registry publishes its new stable list, not from onAdd/onRemove.
remoteControlsRegistry.subscribe(refreshRemoteControls);
const owners = new WeakMap<Function, FoliumRegistryEntry<FoliumRemoteControlsDef>>();
const active = (entry: FoliumRegistryEntry<FoliumRemoteControlsDef>) => remoteControlsRegistry.get(entry.id) === entry;
const copy = (items: FoliumRemoteAction[]) => items.map(item => ({ ...item, label: { ...item.label } }));

/** Validate metadata before projecting it into another renderer. */
export function validateRemoteControls(event: Pick<FoliumRemoteControlsEvent, 'transport' | 'actions'>) {
    const ids = new Set<string>();
    for (const list of [event.transport, event.actions]) {
        if (!Array.isArray(list) || list.length > 32) throw new Error('invalid-remote-action-list');
        for (const item of list) {
            if (!item || typeof item.id !== 'string' || !/^[^\s:]+:[^\s]+$/.test(item.id) || item.id.length > 256
                || ids.has(item.id) || typeof item.run !== 'function' || !hasFoliumIcon(item.icon)
                || !item.label || typeof item.label !== 'object' || Array.isArray(item.label)
                || Object.keys(item.label).length > 32 || Object.entries(item.label).some(([locale, label]) =>
                    !locale || locale.length > 32 || (label !== undefined && (typeof label !== 'string' || label.length > 2048)))
                || (item.count !== undefined && (!Number.isFinite(item.count) || item.count < 0))
                || [item.disabled, item.pressed, item.primary].some(value => value !== undefined && typeof value !== 'boolean')
                || (item.tone !== undefined && !['normal', 'alert'].includes(item.tone))) throw new Error('invalid-remote-action');
            ids.add(item.id);
        }
    }
}

export function resolveRemoteControls(source: FoliumRemoteControlsEvent, read: () => FoliumRemoteControlsEvent) {
    validateRemoteControls(source);
    let result = { ...source, transport: copy(source.transport), actions: copy(source.actions) };
    // Retaining or editing a native descriptor never bypasses the latest host guard.
    for (const item of [...result.transport, ...result.actions]) {
        item.run = () => {
            const latest = read();
            const original = [...latest.transport, ...latest.actions].find(candidate => candidate.id === item.id);
            if (!original || original.disabled) throw new Error('remote-host-action-unavailable');
            return original.run();
        };
    }
    const context = Object.freeze({ ...source.context, song: source.context.song ? Object.freeze({ ...source.context.song }) : null });
    const entries = [...remoteControlsRegistry.list()].sort((a, b) => (a.def.order ?? 500) - (b.def.order ?? 500));
    for (const entry of entries) {
        const next = { context, transport: copy(result.transport), actions: copy(result.actions) };
        try {
            const returned = entry.def.edit(next) as unknown;
            if (returned && typeof (returned as Promise<unknown>).then === 'function') {
                void Promise.resolve(returned).catch(error => reportFoliumIssue(entry.modId, 'remote controls', error));
                throw new Error('remote-control-editor-must-be-synchronous');
            }
            validateRemoteControls(next);
            const previous = new Map([...result.transport, ...result.actions].map(item => [item.id, item]));
            for (const item of [...next.transport, ...next.actions]) {
                if (!previous.has(item.id) && !item.id.startsWith(`${entry.modId}:`)) throw new Error('remote-action-owner-mismatch');
                const native = [...source.transport, ...source.actions].find(candidate => candidate.id === item.id);
                if (native?.disabled) item.disabled = true;
                if (item.run !== previous.get(item.id)?.run) {
                    const callback = item.run;
                    const wrapped = () => {
                        if (!active(entry)) throw new Error('remote-action-registration-expired');
                        return callback();
                    };
                    owners.set(wrapped, entry);
                    item.run = wrapped;
                }
            }
            result = { context, transport: copy(next.transport), actions: copy(next.actions) };
        } catch (error) { reportFoliumIssue(entry.modId, 'remote controls', error); }
    }
    return result;
}

export async function invokeRemoteAction(item: FoliumRemoteAction) {
    const owner = owners.get(item.run);
    if (item.disabled || (owner && !active(owner))) return false;
    try {
        await item.run();
        return true;
    } catch (error) {
        console.warn(`[Folium] remote action ${item.id} failed`, error);
        return false;
    } finally { refreshRemoteControls(); }
}

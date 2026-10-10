import type { FoliumContextKind, FoliumEventPriority, FoliumUiSlotContext, FoliumUiSlotEvent, FoliumUiSlotItem, FoliumUiSlots } from './contract';
import { createFoliumRegistry, type FoliumRegistryEntry } from './registry';
import { reportFoliumIssue } from './status';
import { UI_SLOT_DEFINITIONS, getUiSlotDefinition } from './uiSlotCatalog';
import { copyUiSlots, validateUiSlots } from './uiSlotItems';
import { invalidateUiSlots } from './uiSlotInvalidation';

// src/mods/folium/uiSlots.ts
// Owned synchronous list editors for the supported queue UI surfaces.
export { getUiSlotRevision, subscribeUiSlots } from './uiSlotInvalidation';
interface Contribution { id: string; target: string; handler: (event: FoliumUiSlotEvent) => void; priority: FoliumEventPriority }
const ranks = { highest: 0, high: 1, normal: 2, low: 3, lowest: 4 };
let serial = 0;
export const uiSlotsRegistry = createFoliumRegistry<Contribution>('uiSlots', {
    validate(def) {
        if (!getUiSlotDefinition(def.target) || typeof def.handler !== 'function' || !Object.hasOwn(ranks, def.priority)) throw new Error('invalid-ui-slot-registration');
        return { ...def };
    },
});
// list() is updated after registry hooks, so consumers must be notified from subscribe.
uiSlotsRegistry.subscribe(() => invalidateUiSlots());
type Slots = Record<string, FoliumUiSlotItem[]>;
export interface UiSlotSource { target: string; defaults: Slots; context: FoliumUiSlotContext }
type Binding = UiSlotSource & { read?: () => UiSlotSource | undefined; alive: () => boolean };
const bindings = new WeakMap<FoliumUiSlotItem, Binding>();
const callbackOwners = new WeakMap<Function, FoliumRegistryEntry<Contribution>>();
const active = (entry: FoliumRegistryEntry<Contribution>) => uiSlotsRegistry.get(entry.id) === entry;
// Editing display metadata cannot enable a native action disabled by its host state.
function bindHostCallbacks(items: Slots, source: UiSlotSource, read?: Binding['read']) {
    for (const item of Object.values(items).flat()) for (const name of ['run', 'setChecked'] as const) {
        if (typeof item[name] !== 'function') continue;
        Object.assign(item, { [name]: (...args: unknown[]) => {
            const latest = read ? read() : source;
            const original = latest && Object.values(latest.defaults).flat().find(candidate => candidate.id === item.id);
            if (!original || original.disabled || original.kind !== item.kind || typeof original[name] !== 'function') throw new Error('ui-slot-host-action-unavailable');
            return (original[name] as (...values: unknown[]) => unknown)(...args);
        } });
    }
}
function bindCallbacks(items: Slots, previous: Slots, entry: FoliumRegistryEntry<Contribution>) {
    const old = new Map(Object.values(previous).flat().map(item => [item.id, item]));
    for (const item of Object.values(items).flat()) for (const name of ['run', 'setChecked'] as const) {
        const callback = item[name];
        if (typeof callback !== 'function' || callback === old.get(item.id)?.[name]) continue;
        const wrapped = (...args: unknown[]) => {
            if (!active(entry)) throw new Error('ui-slot-registration-expired');
            return (callback as (...values: unknown[]) => unknown)(...args);
        };
        callbackOwners.set(wrapped, entry);
        Object.assign(item, { [name]: wrapped });
    }
}
export function resolveUiSlots(target: string, defaults: Slots, context: FoliumUiSlotContext, read?: Binding['read']): Slots {
    const definition = getUiSlotDefinition(target);
    if (!definition) throw new Error(`unknown-ui-slot:${target}`);
    validateUiSlots(definition, defaults);
    let slots = copyUiSlots(defaults);
    bindHostCallbacks(slots, { target, defaults, context }, read);
    const readonlyContext = Object.freeze({ ...context, song: context.song ? Object.freeze({ ...context.song }) : context.song,
        values: context.values ? Object.freeze({ ...context.values }) : undefined });
    const entries = uiSlotsRegistry.list().filter(entry => entry.def.target === target)
        .map((entry, order) => ({ entry, order })).sort((a, b) => ranks[a.entry.def.priority] - ranks[b.entry.def.priority] || a.order - b.order);
    for (const { entry } of entries) {
        const event = { target, context: readonlyContext, slots: copyUiSlots(slots) };
        try {
            const result = entry.def.handler(event) as unknown;
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                void Promise.resolve(result).catch(error => reportFoliumIssue(entry.modId, `ui slot ${target}`, error));
                throw new Error('ui-slot-handler-must-be-synchronous');
            }
            validateUiSlots(definition, event.slots);
            const oldIds = new Set(Object.values(slots).flat().map(item => item.id));
            if (Object.values(event.slots).flat().some(item => !oldIds.has(item.id) && !item.id.startsWith(`${entry.modId}:`))) throw new Error('ui-slot-item-owner-mismatch');
            bindCallbacks(event.slots, slots, entry);
            slots = copyUiSlots(event.slots);
        } catch (error) { reportFoliumIssue(entry.modId, `ui slot ${target}`, error); }
    }
    for (const item of Object.values(slots).flat()) {
        const owners = [item.run, item.setChecked].flatMap(callback => callback ? callbackOwners.get(callback) ?? [] : []);
        bindings.set(item, { target, defaults, context, read, alive: () => owners.every(active) });
    }
    return slots;
}
/** Re-resolve the current description before executing; stale registrations never reactivate. */
export async function invokeUiSlotItem(item: FoliumUiSlotItem, payload?: unknown): Promise<boolean> {
    const binding = bindings.get(item);
    if (!binding || !binding.alive()) return false;
    const source = binding.read ? binding.read() : binding;
    if (!source) return false;
    const current = Object.values(resolveUiSlots(source.target, source.defaults, source.context)).flat().find(candidate => candidate.id === item.id);
    if (!current || current.disabled || current.kind !== item.kind) return false;
    try {
        if (current.kind === 'button') await current.run!();
        else if (current.kind === 'toggle' && typeof payload === 'boolean') await current.setChecked!(payload);
        else return false;
        return true;
    } catch (error) {
        console.warn(`[Folium] ui action ${current.id} failed`, error);
        return false;
    } finally { invalidateUiSlots(source.target, source.context.entityId); }
}
export function createFoliumUiSlots(modId: string, context: FoliumContextKind): FoliumUiSlots {
    return Object.freeze({
        list: () => UI_SLOT_DEFINITIONS,
        register: (target: string, handler: (event: FoliumUiSlotEvent) => void, options?: { priority?: FoliumEventPriority }) => {
            if (context !== 'main') return () => {};
            const handle = uiSlotsRegistry.register(modId, { id: `editor-${++serial}`, target, handler, priority: options?.priority ?? 'normal' });
            return handle.unregister;
        },
        invalidate: (target?: string, entityId?: string) => {
            if (target !== undefined && !getUiSlotDefinition(target)) throw new Error(`unknown-ui-slot:${target}`);
            if (context === 'main') invalidateUiSlots(target, entityId);
        },
    });
}

import type { FoliumUiSlotDefinition, FoliumUiSlotItem } from './contract';
import { hasFoliumIcon } from './icons';

// src/mods/folium/uiSlotItems.ts
// Each contributor receives fresh metadata; invalid contributions roll back independently.
export const copyUiSlots = (slots: Record<string, FoliumUiSlotItem[]>) => Object.fromEntries(
    Object.entries(slots).map(([name, items]) => [name, items.map(item => ({ ...item, label: { ...item.label } }))]),
);
export function validateUiSlots(definition: FoliumUiSlotDefinition, slots: Record<string, FoliumUiSlotItem[]>) {
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)
        || Object.keys(slots).some(group => !definition.groups.includes(group))) throw new Error('invalid-ui-slot-groups');
    const ids = new Set<string>();
    for (const group of definition.groups) {
        if (!Array.isArray(slots[group])) throw new Error('invalid-ui-slot-group');
        for (const item of slots[group]) {
            if (!item || typeof item.id !== 'string' || !/^[^\s:]+:[^\s]+$/.test(item.id) || ids.has(item.id)
                || !(definition.groupKinds?.[group] ?? definition.kinds).includes(item.kind)
                || !item.label || typeof item.label !== 'object' || Array.isArray(item.label)
                || Object.values(item.label).some(text => text !== undefined && typeof text !== 'string')
                || (item.icon !== undefined && (typeof item.icon !== 'string' || !hasFoliumIcon(item.icon)))
                || (item.disabled !== undefined && typeof item.disabled !== 'boolean')
                || (item.pressed !== undefined && typeof item.pressed !== 'boolean')
                || (item.count !== undefined && (!Number.isFinite(item.count) || item.count < 0))) throw new Error('invalid-ui-slot-item');
            ids.add(item.id);
            if (item.kind === 'button' && typeof item.run !== 'function') throw new Error('missing-ui-slot-action');
            if (item.kind === 'toggle' && (typeof item.checked !== 'boolean' || typeof item.setChecked !== 'function')) throw new Error('invalid-ui-slot-toggle');
        }
    }
}

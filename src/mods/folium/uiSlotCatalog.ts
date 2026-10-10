import type { FoliumUiSlotDefinition } from './contract';

// src/mods/folium/uiSlotCatalog.ts
// Publish only the queue surfaces that need editable native controls.
const definition = (id: string, groups: string[], overline = false): FoliumUiSlotDefinition => Object.freeze({
    id, label: Object.freeze({ en: id }), groups: Object.freeze(groups),
    kinds: Object.freeze(['text', 'button', 'toggle'] as const),
    ...(overline ? { groupKinds: Object.freeze({ overline: Object.freeze(['text'] as const) }) } : {}),
});
export const UI_SLOT_DEFINITIONS: readonly FoliumUiSlotDefinition[] = Object.freeze([
    definition('command.toolbar', ['leading', 'trailing']),
    definition('queue.header', ['leading', 'trailing']),
    definition('queue.entry', ['overline', 'actions'], true),
    definition('lattice.tools', ['actions']),
]);
export const getUiSlotDefinition = (target: string) => UI_SLOT_DEFINITIONS.find(item => item.id === target);

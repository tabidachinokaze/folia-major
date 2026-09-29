import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '@/types';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import type { FoliumPlayerPanelTabDef } from '../contract';
import { createFoliumRegistry, useFoliumRegistryEntries } from '../registry';
import { resolveFoliumLabel } from '../params';
import { FoliumPanelTabContent } from './playerPanelTabs';

// src/mods/folium/registries/homeTabs.tsx
export const homeTabsRegistry = createFoliumRegistry<FoliumPlayerPanelTabDef>('homeTabs', {
    validate(def) {
        if (typeof def.mount !== 'function') throw new Error('homeTabs.register: mount must be a function');
        return def;
    },
    onRemove(entry) {
        const state = useSearchNavigationStore.getState();
        if (state.homeModTab === entry.id) state.setHomeModTab(null);
    },
});
export function useFoliumHomeTabs() {
    const entries = useFoliumRegistryEntries(homeTabsRegistry);
    const { i18n } = useTranslation();
    return useMemo(() => [...entries]
        .sort((a, b) => (a.def.order ?? 500) - (b.def.order ?? 500) || a.id.localeCompare(b.id))
        .map(entry => ({ id: entry.id, label: resolveFoliumLabel(entry.def.label, i18n.language, entry.name) })),
        [entries, i18n.language]);
}
export function FoliumHomeTabBody({ tab, theme, isDaylight }: { tab: string; theme: Theme; isDaylight: boolean }) {
    const entries = useFoliumRegistryEntries(homeTabsRegistry);
    const entry = entries.find(entry => entry.id === tab);
    return entry ? <div className="w-full h-full overflow-auto px-4 md:px-12 py-4" data-home-mod-tab={tab}>
        <FoliumPanelTabContent key={entry.id} entry={entry} theme={theme} isDaylight={isDaylight} />
    </div> : null;
}

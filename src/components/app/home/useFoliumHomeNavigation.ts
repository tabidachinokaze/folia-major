import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFoliumRegistryEntries } from '../../../mods/folium/registry';
import { closeFoliumHomeTab, homeTabsRegistry, selectFoliumHomeTab, useFoliumHomeTabStore } from '../../../mods/folium/registries/homeTabs';
import { resolveFoliumLabel } from '../../../mods/folium/params';
import type { LibraryHomeExtraTab } from '../../../library/core/contracts/suite';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';

// src/components/app/home/useFoliumHomeNavigation.ts
// Resolve localized owned pages without sending their IDs to native data-source navigation.

export function useFoliumHomeNavigation() {
    const { i18n } = useTranslation();
    const entries = useFoliumRegistryEntries(homeTabsRegistry);
    const activeId = useFoliumHomeTabStore(state => state.activeId);
    const extraTabs = useMemo<LibraryHomeExtraTab[]>(() => [...entries]
        .sort((left, right) => (left.def.order ?? 500) - (right.def.order ?? 500) || left.id.localeCompare(right.id))
        .map(entry => ({ id: entry.id, label: resolveFoliumLabel(entry.def.label, i18n.language, entry.name),
            select: () => { selectFoliumHomeTab(entry.id); } })), [entries, i18n.language]);
    // Native commands continue to select the original music-source tabs, dismissing an owned page.
    useEffect(() => useSearchNavigationStore.subscribe((state, previous) => {
        if (state.homeViewTab !== previous.homeViewTab) closeFoliumHomeTab();
    }), []);
    return { extraTabs, activeEntry: entries.find(entry => entry.id === activeId) ?? null };
}

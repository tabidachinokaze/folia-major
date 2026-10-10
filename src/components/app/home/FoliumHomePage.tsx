import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import type { Theme } from '../../../types';
import type { FoliumHomeTabDef } from '../../../mods/folium/contract';
import type { FoliumRegistryEntry } from '../../../mods/folium/registry';
import type { LibraryHomeExtraTab } from '../../../library/core/contracts/suite';
import type { LibraryHomeTabView } from '../../../library/core/contracts/homeModel';
import { FoliumMountHost } from '../../../mods/folium/FoliumMountHost';
import { toFoliumTheme } from '../../../mods/folium/dto';
import { useFoliumPanelContext } from '../../../mods/folium/registries/useFoliumPanelContext';
import { resolveFoliumLabel } from '../../../mods/folium/params';
import { effectiveKeyCode } from '../../../utils/keyboardTargets';
import { isPrimaryModifierPressed, isSecondaryModifierPressed } from '../../../utils/platform';

// src/components/app/home/FoliumHomePage.tsx
// The host provides a full-page box and native navigation; the mod owns only its ShadowRoot.

export function FoliumHomePage({ entry, theme, isDaylight, tabs, extraTabs, onSelectNativeTab, onClose }: {
    entry: FoliumRegistryEntry<FoliumHomeTabDef>;
    theme: Theme;
    isDaylight: boolean;
    tabs: readonly LibraryHomeTabView[];
    extraTabs: readonly LibraryHomeExtraTab[];
    onSelectNativeTab: (key: LibraryHomeTabView['key']) => void;
    onClose: () => void;
}) {
    const { t, i18n } = useTranslation();
    const ctx = useFoliumPanelContext(theme, isDaylight, i18n.language);
    const foliumTheme = useMemo(() => toFoliumTheme(theme, isDaylight), [theme, isDaylight]);
    const label = resolveFoliumLabel(entry.def.label, i18n.language, entry.name);
    const activeTabRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { activeTabRef.current?.focus({ preventScroll: true }); }, [entry.id]);
    return <section data-folium-home-page={entry.id} data-folia-keyboard-window="true"
        aria-label={label} className="absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden pointer-events-auto"
        style={{ backgroundColor: theme.backgroundColor, color: theme.primaryColor }}
        onKeyDown={event => {
            // Keep the host's explicit global palette entry reachable, including from a ShadowRoot input.
            const key = event.nativeEvent;
            if ((effectiveKeyCode(key) === 'KeyK' || key.key.toLowerCase() === 'k')
                && isPrimaryModifierPressed(key) && !isSecondaryModifierPressed(key) && !key.altKey && !key.shiftKey) return;
            event.stopPropagation();
        }}>
        <header className="flex shrink-0 items-center gap-4 px-4 py-3 md:px-8 border-b border-current/10">
            <button type="button" onClick={onClose} title={t('mods.homeBackToLibrary')}
                aria-label={t('mods.homeBackToLibrary')} className="rounded-full p-2 hover:bg-current/10">
                <ChevronLeft size={20} />
            </button>
            <nav className="flex flex-1 flex-wrap items-center gap-1" aria-label={t('mods.homePageNavigation')}>
                {tabs.map(tab => <button key={tab.key} type="button" disabled={Boolean(tab.disabledReason)}
                    title={tab.disabledReason || tab.label} onClick={() => onSelectNativeTab(tab.key)}
                    className="rounded-full px-3 py-1.5 text-sm opacity-70 hover:opacity-100 disabled:opacity-30">
                    {tab.label}
                </button>)}
                {extraTabs.map(tab => <button key={tab.id} type="button" aria-pressed={tab.id === entry.id}
                    ref={tab.id === entry.id ? activeTabRef : undefined}
                    onClick={tab.select} className={`rounded-full px-3 py-1.5 text-sm ${tab.id === entry.id ? 'bg-current/10 font-semibold' : 'opacity-70 hover:opacity-100'}`}>
                    {tab.label}
                </button>)}
            </nav>
        </header>
        <FoliumMountHost key={entry.id} modId={entry.modId} where={`home tab ${entry.id}`}
            entryKind="home-tab" entryId={entry.id} mount={entry.def.mount} ctx={ctx} shadow fill
            theme={foliumTheme} className="flex-1 min-h-0 w-full overflow-auto" />
    </section>;
}

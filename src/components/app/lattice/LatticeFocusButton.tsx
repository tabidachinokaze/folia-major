import { Crosshair, Focus, ListMusic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLatticeControlsStore } from '../../../stores/useLatticeControlsStore';
import { useLatticeSettingsStore } from '../../../stores/useLatticeSettingsStore';
import { openCommandPaletteCommand } from '../../../stores/useAppViewStore';
import { PRIMARY_MODIFIER_LABEL } from '../../../utils/platform';
import WallToolsButton, { type WallToolsEntry } from '../../wall/WallToolsButton';

import { useUiSlots } from '@/hooks/useUiSlots';
import { useQueueView } from '@/mods/folium/registries/queueViews';
import { queueViewHeaderActions } from '../../shared/useQueueEntrySlots';
import { invokeUiSlotItem } from '@/mods/folium/uiSlots';
import { resolveFoliumLabel } from '@/mods/folium/params';

// src/components/app/lattice/LatticeFocusButton.tsx
// A compact Lattice-only utility panel. It borrows UnifiedPanel's anchored glass surface without
// bringing its cover, tabs or player-only state into the poster wall.
// 实测反馈 1 起按钮、面板、灯光 / 叠色开关、帮助的外壳都在共享的 components/wall/WallToolsButton（bravais 也用）；
// 这里只给 Lattice 自己的三行（聚焦当前歌曲、切歌自动聚焦、队列命令）与帮助内容。
export default function LatticeFocusButton({ isDaylight }: { isDaylight: boolean }) {
    const { t, i18n } = useTranslation();
    useQueueView();
    const focusCurrentSong = useLatticeControlsStore(state => state.focusCurrentSong);
    const autoFocusOnSongChange = useLatticeSettingsStore(state => state.autoFocusOnSongChange);
    const handleToggleAutoFocusOnSongChange = useLatticeSettingsStore(state => state.handleToggleAutoFocusOnSongChange);
    const queueShortcut = `${PRIMARY_MODIFIER_LABEL}+P`;

    const entries: Extract<WallToolsEntry, { kind: 'action' | 'toggle' }>[] = [
        {
            kind: 'action',
            id: 'focus-current',
            icon: Crosshair,
            label: t('home.latticeFocusCurrent'),
            kbd: ': + C',
            kbdHidden: true,
            disabled: !focusCurrentSong,
            onSelect: () => focusCurrentSong?.(),
        },
        {
            kind: 'toggle',
            id: 'auto-focus',
            icon: Focus,
            label: t('home.latticeAutoFocusOnSongChange'),
            checked: autoFocusOnSongChange,
            onToggle: handleToggleAutoFocusOnSongChange,
        },
        {
            kind: 'action',
            id: 'queue-command',
            icon: ListMusic,
            label: t('home.latticeOpenQueueCommand'),
            kbd: queueShortcut,
            onSelect: () => openCommandPaletteCommand('queue'),
        },
    ];
    const iconNames: Record<string, string> = { 'focus-current': 'crosshair', 'auto-focus': 'focus', 'queue-command': 'list-music' };

    const lists = useUiSlots('lattice.tools', { actions: [
        ...entries.map(entry => entry.kind === 'toggle'
            ? { id: `host:${entry.id}`, kind: 'toggle' as const, icon: iconNames[entry.id], label: { [i18n.language]: entry.label }, checked: entry.checked, disabled: entry.disabled, setChecked: entry.onToggle }
            : { id: `host:${entry.id}`, kind: 'button' as const, label: { [i18n.language]: entry.label },
                icon: iconNames[entry.id], disabled: entry.disabled, run: entry.onSelect }),
        ...queueViewHeaderActions(),
    ] }, { surface: 'lattice' });
    const rows: WallToolsEntry[] = lists.actions.map(item => {
        const original = entries.find(entry => item.id === `host:${entry.id}`);
        const label = resolveFoliumLabel(item.label, i18n.language, item.id);
        const iconName = original && item.icon === iconNames[original.id] ? undefined : item.icon ?? null;
        if (original?.kind === 'action' && item.kind === 'button') return { ...original, label, iconName, count: item.count,
            pressed: item.pressed, disabled: item.disabled, onSelect: () => { void invokeUiSlotItem(item); } };
        if (original?.kind === 'toggle' && item.kind === 'toggle') return { ...original, label, iconName, count: item.count,
            disabled: item.disabled, checked: item.checked!, onToggle: value => { void invokeUiSlotItem(item, value); } };
        return { id: item.id, kind: 'mod', item };
    });
    return (
        <WallToolsButton
            idPrefix="lattice-tools"
            label={t('home.latticeTools')}
            isDaylight={isDaylight}
            entries={rows}
            help={(
                <>
                    <li>
                        <span>{t('home.latticeHelpPoster')}</span>
                        <span className="lattice-tools-help-key"><kbd>ESC</kbd>{t('home.latticeHelpReturn')}</span>
                    </li>
                    <li><span>{t('home.latticeHelpMove')}</span></li>
                    <li>
                        <span>{t('home.latticeHelpCommands')}</span>
                        <kbd>S</kbd>
                    </li>
                    <li>
                        <span>{t('home.latticeHelpOpen')}</span>
                        <kbd>{PRIMARY_MODIFIER_LABEL} + B</kbd>
                    </li>
                </>
            )}
        />
    );
}

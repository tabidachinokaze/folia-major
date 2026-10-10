import { useTranslation } from 'react-i18next';
import { useUiSlots } from '@/hooks/useUiSlots';
import { useQueueView } from '@/mods/folium/registries/queueViews';
import { queueViewHeaderActions } from '../shared/useQueueEntrySlots';
import { QueueSlotItems } from '../shared/QueueSlotItems';

// src/components/command-palette/CommandPaletteQueueToolbar.tsx
// Native help and keep-open are list entries, so a mod can insert before either without splitting rows.
export default function CommandPaletteQueueToolbar({ query, showHelp, checked, disabled, onChange }: {
    query: string; showHelp: boolean; checked: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
    const { t, i18n } = useTranslation();
    useQueueView();
    const lists = useUiSlots('command.toolbar', {
        leading: showHelp ? [{ id: 'host:queue-help', kind: 'text', label: { [i18n.language]: t('commandPalette.queueSyntaxHint') } }] : [],
        trailing: [...queueViewHeaderActions(), { id: 'host:queue-keep-open', kind: 'toggle',
            label: { [i18n.language]: t('commandPalette.queueKeepOpen') }, checked, disabled, setChecked: onChange }],
    }, { surface: 'palette', commandId: 'queue', query, locale: i18n.language });
    return <div data-testid="command-palette-queue-toolbar" className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1 text-[11px]">
        <div data-toolbar-side="leading" data-testid="command-palette-queue-syntax-hint" className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><QueueSlotItems items={lists.leading} /></div>
        <div data-toolbar-side="trailing" className="ml-auto flex shrink-0 flex-wrap items-center gap-2"><QueueSlotItems items={lists.trailing} labels /></div>
    </div>;
}

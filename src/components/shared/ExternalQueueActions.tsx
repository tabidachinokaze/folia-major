import { ArrowUpToLine, RefreshCw, ThumbsUp, Trash2, Square } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { invokeExternalQueueAction, useExternalQueueStore } from '@/services/externalPlaybackQueue';
import { resolveFoliumLabel } from '@/mods/folium/params';

// src/components/shared/ExternalQueueActions.tsx
// Shared by the native list, command results, collage and configured shuffle slot.
const icons = { 'refresh-cw': RefreshCw, 'trash-2': Trash2, 'arrow-up-to-line': ArrowUpToLine, 'thumbs-up': ThumbsUp, square: Square };
/** Subscribe independently so nickname changes do not rebuild song identity or the poster wall. */
export function ExternalQueueOverline({ entryKey, className = 'text-[10px] leading-3' }: {
    entryKey?: string; className?: string;
}) {
    const { i18n } = useTranslation();
    const overline = useExternalQueueStore(state => entryKey ? state.view?.items.get(entryKey)?.overline : undefined);
    const label = resolveFoliumLabel(overline, i18n.language, '').trim();
    return label ? <span data-session-overline={entryKey} title={label}
        className={`block min-w-0 truncate opacity-60 ${className}`}>{label}</span> : null;
}
export function ExternalQueueActions({ entryKey = null, className = '', size = 14 }: {
    entryKey?: string | null; className?: string; size?: number;
}) {
    const { i18n } = useTranslation();
    const actions = useExternalQueueStore(state => entryKey ? state.view?.items.get(entryKey)?.actions : state.view?.actions);
    return <span className={`inline-flex items-center gap-1 ${className}`}>
        {actions?.map(action => {
            const Icon = icons[action.icon], label = resolveFoliumLabel(action.label, i18n.language, action.id);
            return <button key={action.id} type="button" aria-label={label} title={label} disabled={action.disabled}
                data-session-action={action.id}
                className="inline-flex items-center gap-1 rounded-md p-1.5 hover:bg-current/10 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                onClick={event => { event.stopPropagation(); invokeExternalQueueAction(entryKey, action.id); }}>
                <Icon size={size} />{action.count !== undefined && <span className="text-[10px] tabular-nums">{action.count}</span>}
            </button>;
        })}
    </span>;
}

export function ExternalQueueSummary() {
    const { t } = useTranslation();
    const { count, loading } = useExternalQueueStore(useShallow(state => ({
        count: state.view?.totalCount ?? 0, loading: state.view?.loading ?? false,
    })));
    return <span className="inline-flex items-center gap-2" aria-busy={loading}>
        {t('queue.title')} ({count}){loading && <RefreshCw size={12} className="animate-spin" aria-hidden="true" />}
    </span>;
}

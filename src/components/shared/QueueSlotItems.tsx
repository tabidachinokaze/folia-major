import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createFoliumIcon } from '@/mods/folium/icons';
import { resolveFoliumLabel } from '@/mods/folium/params';
import { invokeUiSlotItem } from '@/mods/folium/uiSlots';
import type { FoliumUiSlotItem } from '@/mods/folium/contract';

// src/components/shared/QueueSlotItems.tsx
// Host-rendered queue controls reuse the public icon and localization helpers.
export function QueueSlotIcon({ name, size = 14 }: { name?: string; size?: number }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        let active = true;
        if (name) void createFoliumIcon(name, { size }).then(icon => {
            if (active && icon) ref.current?.replaceChildren(icon);
        }).catch(error => console.warn('[Folium] queue icon failed', error));
        return () => { active = false; ref.current?.replaceChildren(); };
    }, [name, size]);
    return <span ref={ref} className="inline-flex shrink-0" aria-hidden="true" />;
}
export function QueueSlotItems({ items, className = '', labels = false, size = 14, countDisplay = 'inline' }: {
    items: readonly FoliumUiSlotItem[]; className?: string; labels?: boolean; size?: number; countDisplay?: 'inline' | 'hover';
}) {
    const { i18n } = useTranslation();
    if (!items.length) return null;
    return <span className={`inline-flex min-w-0 items-center gap-1 ${className}`} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    }}>{items.map(item => {
        const label = resolveFoliumLabel(item.label, i18n.language, item.id);
        const icon = item.icon && <QueueSlotIcon name={item.icon} size={size} />;
        const count = item.count !== undefined && <span className="shrink-0 text-[10px] tabular-nums">{item.count}</span>;
        const hoverCount = countDisplay === 'hover' && item.count !== undefined;
        const attrs = { 'data-ui-slot-item': item.id, title: label, 'aria-label': label };
        if (item.kind === 'text') return <span key={item.id} {...attrs} className="min-w-0 break-words opacity-60">{label}{count}</span>;
        if (item.kind === 'toggle') return <label key={item.id} {...attrs} onClick={event => event.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-1.5 opacity-65 hover:opacity-100">
            {icon}<span>{label}</span><input type="checkbox" checked={item.checked} disabled={item.disabled}
                className="h-3.5 w-3.5" style={{ accentColor: 'var(--text-accent)' }}
                onChange={event => { void invokeUiSlotItem(item, event.target.checked); }} />
        </label>;
        return <button key={item.id} {...attrs} type="button" disabled={item.disabled} aria-pressed={item.pressed}
            aria-description={hoverCount ? String(item.count) : undefined}
            className="inline-flex shrink-0 items-center gap-1 rounded-md p-1.5 hover:bg-current/10 disabled:opacity-35 disabled:cursor-not-allowed"
            onClick={event => { event.stopPropagation(); void invokeUiSlotItem(item); }}>
            {icon}{(labels || !icon) && <span className="min-w-0 break-words">{label}</span>}
            {hoverCount ? <span className="queue-slot-hover-count" aria-hidden="true">{item.count}</span> : count}
        </button>;
    })}</span>;
}

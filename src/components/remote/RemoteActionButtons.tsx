import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { Heart, Pause, Play, Repeat, Repeat1, RepeatOff, SkipBack, SkipForward } from 'lucide-react';
import { createFoliumIcon } from '@/mods/folium/icons';
import { resolveFoliumLabel } from '@/mods/folium/params';
import { createRemoteActionActivation } from '@/services/remoteControlActions';
import type { RemoteActionActivation, RemoteActionDescription, RemoteControlsSnapshot } from '@/types/remoteControl';

// src/components/remote/RemoteActionButtons.tsx
// Only transport and song actions are extensible; native window tools remain alongside them.
const nativeIcons = { 'skip-back': SkipBack, 'skip-forward': SkipForward, play: Play, pause: Pause,
    'repeat-off': RepeatOff, 'repeat-1': Repeat1, repeat: Repeat, heart: Heart };
function ActionIcon({ item }: { item: RemoteActionDescription }) {
    const ref = useRef<HTMLSpanElement>(null);
    const Native = Object.hasOwn(nativeIcons, item.icon) ? nativeIcons[item.icon as keyof typeof nativeIcons] : undefined;
    useEffect(() => {
        if (Native) return;
        let alive = true;
        void createFoliumIcon(item.icon, { size: 16 }).then(icon => { if (alive && icon) ref.current?.replaceChildren(icon); }).catch(() => {});
        return () => { alive = false; ref.current?.replaceChildren(); };
    }, [Native, item.icon]);
    return Native ? <Native size={item.primary ? 16 : 15} strokeWidth={2}
        fill={item.icon === 'play' || item.icon === 'pause' || (item.icon === 'heart' && item.pressed) ? 'currentColor' : 'none'} />
        : <span className="inline-flex" ref={ref} aria-hidden="true" />;
}
export function RemoteActionButtons({ snapshot, group, isDaylight, send, onNavigate, onHover }: {
    snapshot: RemoteControlsSnapshot;
    group: 'transport' | 'actions';
    isDaylight: boolean;
    send(command: RemoteActionActivation): void;
    onNavigate?(direction: 'prev' | 'next', command: RemoteActionActivation): void;
    onHover?(direction: 'prev' | 'next' | null): void;
}) {
    const { i18n } = useTranslation();
    const hovered = useRef<'prev' | 'next' | null>(null);
    useEffect(() => {
        const id = hovered.current === 'prev' ? 'host:previous' : 'host:next';
        if (hovered.current && !snapshot[group].some(item => item.id === id && !item.disabled)) {
            hovered.current = null;
            onHover?.(null);
        }
    }, [snapshot, group, onHover]);
    useEffect(() => () => {
        if (hovered.current) onHover?.(null);
        hovered.current = null;
    }, [onHover]);
    const base = 'group/remote-action relative flex shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-30';
    return <span className="flex flex-wrap items-center gap-0.5" data-testid={`remote-${group}-actions`}>
        {snapshot[group].map(item => {
            const label = resolveFoliumLabel(item.label, i18n.language, item.id);
            const direction = item.id === 'host:previous' ? 'prev' : item.id === 'host:next' ? 'next' : null;
            const size = item.primary ? 'h-9 w-9' : direction ? 'h-8 w-8' : 'h-7 w-7';
            const color = item.primary ? (isDaylight ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-white text-zinc-950 hover:bg-white/90')
                : item.pressed ? (item.tone === 'alert' ? 'text-rose-400 hover:bg-rose-400/10' : (isDaylight ? 'text-zinc-900 hover:bg-black/5' : 'text-white hover:bg-white/10'))
                    : (isDaylight ? 'text-zinc-900/50 hover:bg-black/5 hover:text-zinc-900' : 'text-white/45 hover:bg-white/5 hover:text-white');
            return <button key={item.id} type="button" title={label} aria-label={label} aria-pressed={item.pressed}
                aria-description={item.count === undefined ? undefined : String(item.count)}
                disabled={item.disabled} data-remote-action-id={item.id}
                className={`${base} ${size} ${item.id === 'host:loop' ? 'ml-2' : ''} ${color}`}
                onMouseEnter={() => { if (direction && !item.disabled) { hovered.current = direction; onHover?.(direction); } }}
                onMouseLeave={() => { if (direction) { hovered.current = null; onHover?.(null); } }}
                onClick={() => {
                    const command = createRemoteActionActivation(snapshot, group, item);
                    if (direction && onNavigate) onNavigate(direction, command); else send(command);
                }}>
                <ActionIcon item={item} />
                {item.count !== undefined && <span data-remote-action-count aria-hidden="true"
                    className={`pointer-events-none invisible absolute -right-1 -top-1 rounded-full px-1 text-[10px] leading-4 tabular-nums group-hover/remote-action:visible group-focus-visible/remote-action:visible ${isDaylight ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-950'}`}>
                    {item.count}
                </span>}
            </button>;
        })}
    </span>;
}

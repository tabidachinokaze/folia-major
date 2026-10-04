import { RotateCcw, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveFoliumLabel } from '@/mods/folium/params';
import type { RemoteControlCommand, RemotePlaybackSession } from '@/types/remoteControl';

// src/components/remote/RemoteSessionControls.tsx
export function RemoteSessionControls({ session, disabled, className, send }: {
    session?: RemotePlaybackSession | null;
    disabled: boolean;
    className: string;
    send: (command: RemoteControlCommand) => void;
}) {
    const { i18n } = useTranslation();
    if (!session) return null;
    return <>{[session.vote, session.resume].map(action => {
        if (!action) return null;
        const label = resolveFoliumLabel(action.label, i18n.language, action.id);
        const Icon = action === session.vote ? ThumbsUp : RotateCcw;
        return <button key={action.id} type="button" title={label} aria-label={label}
            disabled={disabled || action.disabled} className={`${className} gap-1 px-1.5`} style={{ width: 'auto', minWidth: 28 }}
            onClick={() => send({ type: 'session-action', sessionId: session.id, actionId: action.id, entryKey: action.entryKey })}>
            <Icon size={15} strokeWidth={2} />
            {action.count !== undefined && <span className="text-[10px] tabular-nums">{action.count}</span>}
        </button>;
    })}</>;
}

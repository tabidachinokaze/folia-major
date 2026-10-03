import { invokeExternalQueueAction, useExternalQueueStore } from './externalPlaybackQueue';
import { hasExternalPlayback, isExternalPlaybackOwner } from './externalPlaybackSession';
import type { RemoteControlCommand, RemotePlaybackSession, RemoteSessionAction } from '../types/remoteControl';
import type { ExternalQueueAction } from '../types/externalPlayback';

// src/services/externalPlaybackRemote.ts
let lastOwner: symbol | null = null;
let sessionId = '';

/** The remote reads the room queue, not the private queue saved before joining it. */
export function readRemotePlaybackSession(): RemotePlaybackSession | null {
    const view = useExternalQueueStore.getState().view;
    if (!view || !isExternalPlaybackOwner(view.owner)) return null;
    if (lastOwner !== view.owner) {
        lastOwner = view.owner;
        sessionId = crypto.randomUUID();
    }
    const project = (action: ExternalQueueAction | undefined, entryKey: string | null): RemoteSessionAction | undefined =>
        action && { id: action.id, entryKey, label: action.label, disabled: action.disabled, count: action.count };
    const key = view.currentSong?.externalQueueEntryKey;
    const current = key ? view.items.get(key) : undefined;
    return {
        id: sessionId,
        canSeek: view.canSeek === true,
        canPrevious: view.canPrevious === true,
        canNext: view.canNext,
        // During an audition the visible track is not the room's current occurrence.
        vote: view.resumeActionId ? undefined : project(current?.actions.find(action => action.icon === 'thumbs-up'), key ?? null),
        resume: project(view.actions.find(action => action.id === view.resumeActionId), null),
    };
}

/** A delayed remote click must never vote for a newer occurrence or a different room. */
export function invokeRemoteSessionAction(command: Extract<RemoteControlCommand, { type: 'session-action' }>) {
    const session = readRemotePlaybackSession();
    if (!session || command.sessionId !== session.id) return false;
    const action = [session.vote, session.resume].find(item => item?.id === command.actionId && item.entryKey === command.entryKey);
    return !!action && !action.disabled && invokeExternalQueueAction(action.entryKey, action.id);
}

export function isRemoteSessionTransportBlocked(command: RemoteControlCommand) {
    if (!hasExternalPlayback()) return false;
    const session = readRemotePlaybackSession();
    if (command.type === 'cycle-loop-mode') return true;
    if (command.type === 'seek') return !session?.canSeek;
    if (command.type === 'previous') return !session?.canPrevious;
    if (command.type === 'next') return !session?.canNext;
    return false;
}

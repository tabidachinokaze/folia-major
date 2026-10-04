import type { SongResult } from '@/types';
import type { ExternalQueueItem, ExternalQueueView } from '@/types/externalPlayback';
import type { FoliumPlaybackQueue, FoliumQueueAction } from './contract';
import { resolveFoliumSongRef, toFoliumSong } from './dto';

// src/mods/folium/externalQueueAdapter.ts
// Keep media, occurrence, and action identity separate; unchanged media reuses the same view objects.
let serial = 0;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const icons = new Set(['refresh-cw', 'trash-2', 'arrow-up-to-line', 'thumbs-up', 'square']);
function actions(values: readonly FoliumQueueAction[] = []) {
    if (!Array.isArray(values)) throw new Error('invalid-queue-actions');
    const ids = new Set<string>();
    return values.map(action => {
        if (!action || typeof action.id !== 'string' || !action.id || ids.has(action.id) || !icons.has(action.icon) || !action.label || typeof action.label !== 'object'
            || Object.values(action.label).some(text => text !== undefined && typeof text !== 'string')
            || (action.count !== undefined && (!Number.isFinite(action.count) || action.count < 0))) {
            throw new Error('invalid-queue-action');
        }
        ids.add(action.id);
        return { ...action, label: { ...action.label } };
    });
}
export function createExternalQueueAdapter(owner: symbol) {
    const prefix = `external:${++serial}:`;
    let previous: ExternalQueueView | null = null;
    return (input: FoliumPlaybackQueue): ExternalQueueView => {
        if (!input || !Array.isArray(input.entries)) throw new Error('invalid-session-queue');
        const ids = new Set<string>(), items = new Map<string, ExternalQueueItem>();
        const queue = input.entries.map(entry => {
            const track = entry?.track;
            if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !track
                || typeof track.id !== 'string' || !track.id || typeof track.source !== 'string' || !track.source
                || typeof track.title !== 'string' || typeof track.artist !== 'string'
                || (track.duration !== undefined && (!Number.isFinite(track.duration) || track.duration < 0))) throw new Error('invalid-queue-entry');
            if (entry.overline !== undefined && (!entry.overline || typeof entry.overline !== 'object' || Array.isArray(entry.overline)
                || Object.values(entry.overline).some(text => text !== undefined && typeof text !== 'string')))
                throw new Error('invalid-queue-overline');
            ids.add(entry.id);
            const key = prefix + entry.id, old = previous?.items.get(key);
            const resolved = resolveFoliumSongRef(track.ref);
            const dto = resolved ? toFoliumSong(resolved) : null;
            const base = dto?.id === track.id && dto?.source === track.source ? resolved : null;
            const candidate: SongResult = {
                id: track.id, name: track.title,
                artists: base?.artists ?? [{ id: 0, name: track.artist }],
                album: { id: base?.album?.id ?? 0, name: track.album ?? base?.album?.name ?? '',
                    coverUrl: track.coverUrl || base?.album?.coverUrl },
                durationMs: track.duration !== undefined ? Math.max(0, track.duration * 1000) : base?.durationMs ?? 0,
                sourceRef: base?.sourceRef ?? { kind: 'online', providerId: track.source, mediaId: track.id },
                externalQueueEntryKey: key,
            };
            const song = old && equal(old.song, candidate) ? old.song : candidate;
            const entryActions = actions(entry.actions);
            if (entry.defaultAction && !entryActions.some(action => action.id === entry.defaultAction)) throw new Error('invalid-queue-default-action');
            const overline = old && equal(old.overline, entry.overline) ? old.overline
                : entry.overline ? { ...entry.overline } : undefined;
            const item = { id: entry.id, song, overline, actions: entryActions, defaultAction: entry.defaultAction };
            items.set(key, old && old.song === song && equal(old.actions, entryActions) && equal(old.overline, overline)
                && old.defaultAction === entry.defaultAction ? old : item);
            return song;
        });
        if (input.currentId !== null && !ids.has(input.currentId)) throw new Error('queue-current-entry-missing');
        const toolbar = actions(input.actions);
        const stopAction = input.stopAction ? actions([input.stopAction])[0] : undefined;
        if (stopAction && toolbar.some(action => action.id === stopAction.id)) throw new Error('duplicate-queue-stop-action');
        if (input.syncActionId && !toolbar.some(action => action.id === input.syncActionId)) throw new Error('invalid-queue-sync-action');
        if (input.resumeActionId && !toolbar.some(action => action.id === input.resumeActionId)) throw new Error('invalid-queue-resume-action');
        const stableQueue = previous && queue.length === previous.queue.length && queue.every((song, i) => song === previous!.queue[i])
            ? previous.queue : queue;
        const view: ExternalQueueView = {
            owner, items, queue: stableQueue, currentSong: input.currentId === null ? null : items.get(prefix + input.currentId)!.song,
            actions: previous && equal(previous.actions, toolbar) ? previous.actions : toolbar,
            syncActionId: input.syncActionId, canNext: input.canNext === true,
            resumeActionId: input.resumeActionId, canSeek: input.canSeek === true, canPrevious: input.canPrevious === true,
            stopAction: previous && equal(previous.stopAction, stopAction) ? previous.stopAction : stopAction,
            totalCount: Math.max(queue.length, Number.isSafeInteger(input.totalCount) ? input.totalCount! : queue.length), loading: input.loading === true,
        };
        previous = view;
        return view;
    };
}

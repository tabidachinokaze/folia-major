import type { SongResult } from '@/types';
import type { FoliumQueueViewAction, FoliumQueueViewSnapshot } from './contract';
import { hasFoliumIcon } from './icons';

// src/mods/folium/queueViewAdapter.ts
// UI occurrence identity never changes media/cache identity; count updates retain song objects.
export interface QueueView {
    owner: object;
    queue: SongResult[];
    currentSong: SongResult | null;
    entries: ReadonlyMap<string, { id: string; overline?: Record<string, string | undefined>; actions: FoliumQueueViewAction[]; defaultAction?: string }>;
    actions: FoliumQueueViewAction[];
    totalCount: number;
}
const label = (value: unknown): value is Record<string, string | undefined> => !!value && typeof value === 'object'
    && !Array.isArray(value) && Object.values(value).every(text => text === undefined || typeof text === 'string');
const actions = (input: readonly FoliumQueueViewAction[] = []) => {
    if (!Array.isArray(input)) throw new Error('invalid-queue-actions');
    const ids = new Set<string>();
    return input.map(action => {
        if (!action || typeof action.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(action.id) || ids.has(action.id) || !label(action.label)
            || (action.icon !== undefined && !hasFoliumIcon(action.icon))
            || (action.disabled !== undefined && typeof action.disabled !== 'boolean')
            || (action.count !== undefined && (!Number.isFinite(action.count) || action.count < 0))) throw new Error('invalid-queue-action');
        ids.add(action.id);
        return { ...action, label: { ...action.label } };
    });
};
export function createQueueViewAdapter(owner: object, prefix: string) {
    let previous: QueueView | null = null;
    let signature = '';
    return (input: FoliumQueueViewSnapshot): QueueView => {
        if (!input || !Array.isArray(input.entries)
            || (input.totalCount !== undefined && (!Number.isSafeInteger(input.totalCount) || input.totalCount < input.entries.length))) throw new Error('invalid-queue-view');
        const ids = new Set<string>(), entries = new Map<string, QueueView['entries'] extends ReadonlyMap<string, infer E> ? E : never>();
        const previousSongs = new Map(previous?.queue.map(song => [song.queuePresentationId, song]) ?? []);
        const queue = input.entries.map(entry => {
            const track = entry?.track;
            if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !track
                || typeof track.id !== 'string' || !track.id || typeof track.source !== 'string' || !track.source
                || typeof track.title !== 'string' || typeof track.artist !== 'string'
                || (track.album !== undefined && track.album !== null && typeof track.album !== 'string')
                || (track.coverUrl !== undefined && typeof track.coverUrl !== 'string')
                || (track.duration !== undefined && (!Number.isFinite(track.duration) || track.duration < 0))
                || (entry.overline !== undefined && !label(entry.overline))
                || (entry.defaultAction !== undefined && (typeof entry.defaultAction !== 'string' || !entry.defaultAction))) throw new Error('invalid-queue-entry');
            ids.add(entry.id);
            const key = `${prefix}:${entry.id}`;
            const candidate: SongResult = { id: track.id, name: track.title, artists: [{ id: 0, name: track.artist }],
                album: { id: 0, name: track.album ?? '', coverUrl: track.coverUrl }, durationMs: (track.duration ?? 0) * 1000,
                sourceRef: { kind: 'online', providerId: track.source, mediaId: track.id }, queuePresentationId: key };
            const old = previousSongs.get(key);
            const entryActions = actions(entry.actions);
            if (entry.defaultAction && !entryActions.some(action => action.id === entry.defaultAction)) throw new Error('invalid-queue-default-action');
            entries.set(key, { id: entry.id, overline: entry.overline ? { ...entry.overline } : undefined, actions: entryActions, defaultAction: entry.defaultAction });
            return old && JSON.stringify(old) === JSON.stringify(candidate) ? old : candidate;
        });
        if (input.currentId !== null && !ids.has(input.currentId)) throw new Error('queue-current-entry-missing');
        const toolbar = actions(input.actions);
        const stableQueue = previous && previous.queue.length === queue.length && queue.every((song, index) => previous!.queue[index] === song) ? previous.queue : queue;
        const next = { owner, queue: stableQueue, currentSong: input.currentId === null ? null : queue.find(song => song.queuePresentationId === `${prefix}:${input.currentId}`)!,
            entries, actions: toolbar, totalCount: Math.max(queue.length, Number.isSafeInteger(input.totalCount) ? input.totalCount! : queue.length) };
        const nextSignature = JSON.stringify([queue, [...entries], next.currentSong, toolbar, next.totalCount]);
        if (previous && signature === nextSignature) return previous;
        signature = nextSignature;
        previous = next;
        return previous;
    };
}

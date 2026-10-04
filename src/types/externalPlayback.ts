import type { SongResult } from '../types';

// src/types/externalPlayback.ts
export type ExternalPlaybackIntent =
    | { type: 'play'; song: SongResult }
    | { type: 'audition'; song: SongResult }
    | { type: 'enqueue'; songs: readonly SongResult[] }
    | { type: 'next' | 'previous' | 'ended' | 'playback-error' }
    | { type: 'seek'; seconds: number; resume: boolean }
    | { type: 'queue-action'; entryId: string | null; actionId: string };

export interface ExternalPlaybackFavoriteChange {
    song: SongResult;
    entryId: string;
    liked: boolean;
}

export type PlaybackStartResult = {
    status: 'source-committed' | 'cancelled' | 'superseded' | 'unavailable' | 'failed';
};

export interface PlaybackRequest {
    readonly external: boolean;
    readonly signal: AbortSignal;
    readonly result: Promise<PlaybackStartResult>;
    isCurrent(): boolean;
    finish(status: PlaybackStartResult['status']): void;
    /** Register an uncommitted resource; remove the callback when ownership passes to the player. */
    onCancel(cleanup: () => void): () => void;
}

/** Generic view data owned by the session; no service-specific room or user fields. */
export interface ExternalQueueAction {
    id: string;
    label: Record<string, string | undefined>;
    icon: 'refresh-cw' | 'trash-2' | 'arrow-up-to-line' | 'thumbs-up' | 'square';
    disabled?: boolean;
    count?: number;
}
export interface ExternalQueueItem {
    id: string;
    song: SongResult;
    actions: readonly ExternalQueueAction[];
    defaultAction?: string;
}
export interface ExternalQueueView {
    owner: symbol;
    items: ReadonlyMap<string, ExternalQueueItem>;
    queue: SongResult[];
    currentSong: SongResult | null;
    actions: readonly ExternalQueueAction[];
    syncActionId?: string;
    resumeActionId?: string;
    stopAction?: ExternalQueueAction;
    canSeek?: boolean;
    canPrevious?: boolean;
    canNext: boolean;
    totalCount: number;
    loading: boolean;
}

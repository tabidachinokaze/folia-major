import type { SongResult } from '../types';

// src/types/externalPlayback.ts
export type ExternalPlaybackIntent =
    | { type: 'play'; song: SongResult }
    | { type: 'enqueue'; songs: readonly SongResult[] }
    | { type: 'next' | 'previous' | 'ended' | 'playback-error' }
    | { type: 'seek'; seconds: number; resume: boolean };

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

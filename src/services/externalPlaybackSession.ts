import type { SongResult } from '../types';

// src/services/externalPlaybackSession.ts
// One owner at a time. User commands are routed separately from server snapshots.
export type ExternalPlaybackIntent =
    | { type: 'select'; song: SongResult }
    | { type: 'next' | 'previous' | 'ended' }
    | { type: 'seek'; seconds: number };

let owner: { token: symbol; dispatch: (intent: ExternalPlaybackIntent) => void } | null = null;
let revision = 0;
let bypass: symbol | undefined;
const listeners = new Set<() => void>();
export const subscribeExternalPlayback = (fn: () => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};
export const hasExternalPlayback = () => owner !== null;
export const externalPlaybackRevision = () => revision;
export const isExternalPlaybackOwner = (token: symbol) => owner?.token === token;

export function acquireExternalPlayback(dispatch: (intent: ExternalPlaybackIntent) => void) {
    if (owner) throw new Error('另一个插件正在接管播放，请先结束其播放会话');
    const token = Symbol('external-playback');
    owner = { token, dispatch };
    revision++;
    listeners.forEach(fn => fn());
    return token;
}

export function releaseExternalPlayback(token: symbol) {
    if (!isExternalPlaybackOwner(token)) return;
    owner = null;
    revision++;
    listeners.forEach(fn => fn());
}

/** Returns true even if the owner fails: external playback must never fall through to a local skip. */
export function routeExternalPlayback(intent: ExternalPlaybackIntent, token?: symbol) {
    if (token && !isExternalPlaybackOwner(token)) return true;
    if (!owner || owner.token === token || owner.token === bypass) return false;
    try { owner.dispatch(intent); } catch { /* The plugin presents its own error state. */ }
    return true;
}

export function runExternalPlaybackCommand<T>(token: symbol, fn: () => T): T {
    if (!isExternalPlaybackOwner(token)) throw new Error('播放会话已结束');
    const previous = bypass;
    bypass = token;
    try { return fn(); } finally { bypass = previous; }
}

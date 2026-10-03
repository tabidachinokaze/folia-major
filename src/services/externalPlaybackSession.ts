import type { ExternalPlaybackIntent } from '../types/externalPlayback';
import { configurePlaybackRequestGuard, invalidatePlaybackRequest } from './playbackRequest';

// src/services/externalPlaybackSession.ts
// Owns control routing, not provider logic or UI. Cleanup always releases the owner, even on errors.
interface Owner {
    token: symbol;
    modId: string;
    dispatch(intent: ExternalPlaybackIntent): void | Promise<void>;
    cleanup(): void;
    report(error: unknown): void;
    audition?: boolean;
}
const report = (target: Owner, error: unknown) => {
    try {
        target.report(error);
    } catch (reportError) {
        console.warn('[Playback] session error reporter failed', reportError);
    }
};
let owner: Owner | null = null;
let revision = 0;
configurePlaybackRequestGuard((token) => (token ? owner?.token === token : owner === null));
export const captureExternalPlaybackBoundary = () => {
    const started = revision;
    return () => started === revision;
};
const listeners = new Set<() => void>();
const notify = () =>
    listeners.forEach((fn) => {
        try {
            fn();
        } catch (error) {
            console.warn('[Playback] session subscriber failed', error);
        }
    });
export const subscribeExternalPlayback = (fn: () => void) => {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
};
export const hasExternalPlayback = () => owner !== null;
export const isExternalPlaybackOwner = (token: symbol) => owner?.token === token;

/** Explicit auditions never fall through to the owner's ordinary play/recommend intent. */
export function routeExternalAudition(song: Extract<ExternalPlaybackIntent, { type: 'play' }>['song']) {
    return owner?.audition === true && routeExternalPlayback({ type: 'audition', song });
}

/** Opted-in owners distinguish local audition from enqueue; legacy session contracts stay intact. */
export function routeExternalPlay(song: Extract<ExternalPlaybackIntent, { type: 'play' }>['song']) {
    return owner?.audition === true
        ? routeExternalAudition(song)
        : routeExternalPlayback({ type: 'play', song });
}

export function acquireExternalPlayback(options: Omit<Owner, 'token'>) {
    if (owner) throw new Error('external-playback-busy');
    invalidatePlaybackRequest();
    const token = Symbol('external-playback');
    owner = { ...options, token };
    revision++;
    notify();
    return token;
}

export function releaseExternalPlayback(token: symbol) {
    if (!owner || owner.token !== token) return;
    const previous = owner;
    owner = null;
    revision++;
    invalidatePlaybackRequest();
    try {
        previous.cleanup();
    } catch (error) {
        report(previous, error);
    } finally {
        notify();
    }
}

export function releaseExternalPlaybackForMod(modId: string) {
    if (owner?.modId === modId) releaseExternalPlayback(owner.token);
}
export function releaseAllExternalPlayback() {
    if (owner) releaseExternalPlayback(owner.token);
}

/** A failing owner is reported and released; the rejected command never falls through locally. */
export function routeExternalPlayback(intent: ExternalPlaybackIntent) {
    if (!owner) return false;
    const target = owner;
    const fail = (error: unknown) => {
        if (owner !== target) return;
        try {
            report(target, error);
        } finally {
            releaseExternalPlayback(target.token);
        }
    };
    try {
        Promise.resolve(target.dispatch(intent)).catch(fail);
    } catch (error) {
        fail(error);
    }
    return true;
}

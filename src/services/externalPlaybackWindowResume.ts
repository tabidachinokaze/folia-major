import type { ExternalPlaybackWindowResume } from '../types/externalPlayback';
import { captureExternalPlaybackBoundary, captureExternalPlaybackWindowState, hasExternalPlayback } from './externalPlaybackSession';

// src/services/externalPlaybackWindowResume.ts
// A renderer rebuild may continue its current owner once, after ordinary audio restoration.
type Resume = (state: unknown, expiresAt: number) => void | Promise<void>;
const listeners = new Map<string, { resume: Resume; report(error: unknown): void }>();
const consumed = new Set<string>();
let pending: ExternalPlaybackWindowResume | null = null;
let isCurrentBoundary = () => true;
const MAX_AGE = 60_000;

export function capturePlaybackWindowResume(): ExternalPlaybackWindowResume | undefined {
    const captured = captureExternalPlaybackWindowState();
    if (!captured || captured.state == null) return;
    try {
        const json = JSON.stringify(captured.state);
        // Session identity only; this channel is not a general persistence store.
        if (!json || json.length > 4096) return;
        return { id: crypto.randomUUID(), modId: captured.modId, state: JSON.parse(json),
            expiresAt: Date.now() + MAX_AGE, queue: captured.queue };
    } catch {
        return;
    }
}

function deliver() {
    const ticket = pending;
    if (!ticket) return;
    if (ticket.expiresAt <= Date.now() || !isCurrentBoundary() || hasExternalPlayback()) {
        pending = null;
        return;
    }
    const listener = listeners.get(ticket.modId);
    if (!listener) return;
    pending = null;
    try {
        Promise.resolve(listener.resume(ticket.state, ticket.expiresAt)).catch(listener.report);
    } catch (error) {
        listener.report(error);
    }
}

/** Called only after restoring the main-window playback handoff, never on an ordinary launch. */
export function restorePlaybackWindowResume(ticket: ExternalPlaybackWindowResume | undefined) {
    if (!ticket || typeof ticket.id !== 'string' || !ticket.id || consumed.has(ticket.id)
        || typeof ticket.modId !== 'string' || !ticket.modId || !Number.isFinite(ticket.expiresAt)
        || ticket.expiresAt <= Date.now() || ticket.expiresAt > Date.now() + MAX_AGE) return;
    consumed.add(ticket.id);
    if (consumed.size > 32) consumed.delete(consumed.values().next().value!);
    pending = ticket;
    isCurrentBoundary = captureExternalPlaybackBoundary();
    deliver();
}

export function onPlaybackWindowResume(modId: string, resume: Resume, report: (error: unknown) => void) {
    const listener = { resume, report };
    listeners.set(modId, listener);
    deliver();
    return () => {
        if (listeners.get(modId) !== listener) return;
        listeners.delete(modId);
        if (pending?.modId === modId) pending = null;
    };
}

export function discardPlaybackWindowResumeForMod(modId: string) {
    if (pending?.modId === modId) pending = null;
}

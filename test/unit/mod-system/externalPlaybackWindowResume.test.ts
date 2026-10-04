import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireExternalPlayback, releaseAllExternalPlayback } from '@/services/externalPlaybackSession';
import { capturePlaybackWindowResume, discardPlaybackWindowResumeForMod, onPlaybackWindowResume, restorePlaybackWindowResume } from '@/services/externalPlaybackWindowResume';

// test/unit/mod-system/externalPlaybackWindowResume.test.ts
const stops: (() => void)[] = [];
const listen = (modId = 'room') => {
    const resume = vi.fn(), report = vi.fn();
    stops.push(onPlaybackWindowResume(modId, resume, report));
    return { resume, report };
};
const capture = (state: unknown = { uid: '9', roomId: 'official', listening: false }) => {
    acquireExternalPlayback({ modId: 'room', dispatch() {}, cleanup() {}, report: vi.fn(),
        captureWindowState: () => ({ state, queue: [] }) });
    const ticket = capturePlaybackWindowResume();
    releaseAllExternalPlayback();
    return ticket;
};
afterEach(() => { stops.splice(0).forEach(stop => stop()); releaseAllExternalPlayback(); vi.useRealTimers(); });

describe('window recreation owner continuation', () => {
    it('captures only the live owner and delivers once to its mod after explicit restoration', () => {
        const other = listen('other'), room = listen(), ticket = capture();
        expect(room.resume).not.toHaveBeenCalled();
        expect(ticket?.expiresAt).toBeGreaterThan(Date.now() + 59000);
        expect(capturePlaybackWindowResume()).toBeUndefined();
        restorePlaybackWindowResume(ticket);
        restorePlaybackWindowResume(ticket);
        expect(room.resume).toHaveBeenCalledExactlyOnceWith(ticket!.state, ticket!.expiresAt);
        expect(other.resume).not.toHaveBeenCalled();
    });
    it('waits for slow client activation but expires and cannot replay an already consumed handoff', () => {
        vi.useFakeTimers();
        const ticket = capture();
        restorePlaybackWindowResume(ticket);
        vi.advanceTimersByTime(30000);
        expect(listen().resume).toHaveBeenCalledOnce();
        stops.splice(0).forEach(stop => stop());
        const expired = capture();
        restorePlaybackWindowResume(expired);
        vi.advanceTimersByTime(60001);
        const late = listen();
        expect(late.resume).not.toHaveBeenCalled();
        restorePlaybackWindowResume(expired);
        expect(late.resume).not.toHaveBeenCalled();
    });
    it('never displaces a new owner or hands an ordinary release to a replacement mod', () => {
        const room = listen(), ticket = capture();
        acquireExternalPlayback({ modId: 'other', dispatch() {}, cleanup() {}, report() {} });
        restorePlaybackWindowResume(ticket);
        releaseAllExternalPlayback();
        expect(room.resume).not.toHaveBeenCalled();
        expect(capturePlaybackWindowResume()).toBeUndefined();
        restorePlaybackWindowResume(ticket);
        expect(room.resume).not.toHaveBeenCalled();
    });
    it('rejects opt-out, unserializable and oversized state without releasing the owner', () => {
        expect(capture(null)).toBeUndefined();
        expect(capture({ text: 'x'.repeat(4096) })).toBeUndefined();
        const circular: any = {}; circular.self = circular;
        expect(capture(circular)).toBeUndefined();
    });
    it('reports a failed continuation once without retrying or falling through to another mod', async () => {
        const fail = new Error('account changed'), report = vi.fn(), resume = vi.fn().mockRejectedValue(fail);
        stops.push(onPlaybackWindowResume('room', resume, report));
        const ticket = capture();
        restorePlaybackWindowResume(ticket);
        await Promise.resolve();
        expect(report).toHaveBeenCalledExactlyOnceWith(fail);
        restorePlaybackWindowResume(ticket);
        expect(resume).toHaveBeenCalledOnce();
    });
});


it('drops a pending continuation after disable or an intervening playback owner, even when released', () => {
    const ticket = capture();
    restorePlaybackWindowResume(ticket);
    acquireExternalPlayback({ modId: 'other', dispatch() {}, cleanup() {}, report() {} });
    releaseAllExternalPlayback();
    expect(listen().resume).not.toHaveBeenCalled();
    stops.splice(0).forEach(stop => stop());
    const disabled = capture();
    restorePlaybackWindowResume(disabled);
    discardPlaybackWindowResumeForMod('room');
    expect(listen().resume).not.toHaveBeenCalled();
});

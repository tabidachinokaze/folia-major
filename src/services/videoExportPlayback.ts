import { usePlaybackStore } from '../stores/usePlaybackStore';
import { currentTime } from '../stores/motionSignals';
import { useExternalQueueStore } from './externalPlaybackQueue';
import { captureExternalPlaybackBoundary, hasExternalPlayback, subscribeExternalPlayback } from './externalPlaybackSession';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import type { VideoExportStartMode } from '../types/videoExport';

// src/services/videoExportPlayback.ts
const sessionMediaKey = () => {
    const view = useExternalQueueStore.getState().view;
    if (!view) return null;
    // A local audition can outlive the room's current occurrence. Switching
    // between audition and room playback is still a recording boundary.
    return view.stopAction || view.resumeActionId
        ? `audition:${view.stopAction?.id ?? view.resumeActionId}`
        : `room:${view.currentSong?.externalQueueEntryKey ?? ''}`;
};

/** Observe one source/occurrence; recording never acquires or controls a room lease. */
export function captureVideoExportPlayback(
    audio: HTMLAudioElement,
    getAudio: () => HTMLAudioElement | null,
    pause: () => void,
    resume: () => Promise<void>,
) {
    const passive = hasExternalPlayback(),
        sameSession = captureExternalPlaybackBoundary(),
        original = usePlaybackStore.getState(),
        songKey = original.currentSong ? getPlaybackSongKey(original.currentSong) : null,
        sessionKey = sessionMediaKey(),
        wasPaused = audio.paused,
        previousLoop = audio.loop,
        previousTime = audio.currentTime;
    let stale = false, prepared = false;
    const isCurrent = () => {
        const state = usePlaybackStore.getState();
        if ((passive && audio.ended) || !sameSession() || getAudio() !== audio || state.audioSrc !== original.audioSrc ||
            (state.currentSong ? getPlaybackSongKey(state.currentSong) : null) !== songKey ||
            sessionMediaKey() !== sessionKey) stale = true;
        return !stale;
    };
    return {
        passive,
        isCurrent,
        subscribe(onChanged: () => void) {
            let notified = false;
            const check = () => {
                if (!isCurrent() && !notified) {
                    notified = true;
                    onChanged();
                }
            };
            const invalidate = () => { stale = true; check(); };
            const stopPlayback = usePlaybackStore.subscribe(check),
                stopQueue = useExternalQueueStore.subscribe(check),
                stopSession = subscribeExternalPlayback(check);
            audio.addEventListener('emptied', invalidate);
            // A room can finish its track before publishing the next source.
            // Observe this throughout preparation, not just after recorder.start.
            // Local full-song export may intentionally rewind an ended track.
            if (passive) audio.addEventListener('ended', invalidate);
            check();
            return () => {
                stopPlayback();
                stopQueue();
                stopSession();
                audio.removeEventListener('emptied', invalidate);
                if (passive) audio.removeEventListener('ended', invalidate);
            };
        },
        prepare(mode: VideoExportStartMode) {
            if (!isCurrent()) return;
            if (passive) return;
            prepared = true;
            pause();
            audio.pause();
            audio.loop = false;
            if (mode === 'from-start') {
                audio.currentTime = 0;
                currentTime.set(0);
            }
        },
        async resume() {
            if (!passive && isCurrent()) await resume();
        },
        restore() {
            // This also covers cancellation before preparation and late dialog
            // responses after a new room/song took ownership of the element.
            if (passive || !prepared || !isCurrent()) return;
            audio.loop = previousLoop;
            if (wasPaused) {
                audio.pause();
                audio.currentTime = previousTime;
                currentTime.set(previousTime);
            }
        },
    };
}

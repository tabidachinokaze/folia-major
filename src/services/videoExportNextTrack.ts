import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useExternalQueueStore } from './externalPlaybackQueue';
import { subscribeExternalPlayback } from './externalPlaybackSession';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import type { SongResult } from '../types';

// src/services/videoExportNextTrack.ts
export const getVideoExportRoomOccurrence = () => {
    const song = useExternalQueueStore.getState().view?.currentSong;
    return song ? song.externalQueueEntryKey ?? getPlaybackSongKey(song) : null;
};
export interface VideoExportTrackStart {
    song: SongResult;
    source: string;
    occurrence: string;
}

/** Arm only after capture setup. Queue metadata alone never proves that the old audio stopped. */
export function waitForNextVideoExportTrack(
    audio: HTMLAudioElement,
    isSessionCurrent: () => boolean,
    signal: AbortSignal,
    baseline = getVideoExportRoomOccurrence(),
    changedError = new Error('playback-changed'),
): Promise<VideoExportTrackStart> {
    return new Promise((resolve, reject) => {
        let candidate = baseline, previousSource = usePlaybackStore.getState().audioSrc,
            previousTime = audio.currentTime, reset = false, startedSource: string | null = null, finished = false;
        const dispose: (() => void)[] = [];
        const finish = (error?: unknown, track?: VideoExportTrackStart) => {
            if (finished) return;
            finished = true;
            dispose.forEach(stop => stop());
            if (error) reject(error); else resolve(track!);
        };
        const check = () => {
            if (finished) return;
            if (signal.aborted) { finish(signal.reason); return; }
            if (!isSessionCurrent()) { finish(changedError); return; }
            const key = getVideoExportRoomOccurrence(), state = usePlaybackStore.getState(), view = useExternalQueueStore.getState().view;
            if (key !== candidate) {
                // Do not silently skip an unplayable next track and capture the third.
                if (candidate && candidate !== baseline) { finish(changedError); return; }
                candidate = key;
                previousSource = state.audioSrc;
                previousTime = audio.currentTime;
                reset = false;
                startedSource = null;
            }
            if (!key || key === baseline || (!startedSource || startedSource !== state.audioSrc) || view?.stopAction || view?.resumeActionId ||
                !state.currentSong || !view?.currentSong || !state.audioSrc || audio.ended || audio.paused ||
                audio.seeking || audio.readyState < 2 || audio.getAttribute('src') !== state.audioSrc ||
                getPlaybackSongKey(state.currentSong) !== getPlaybackSongKey(view.currentSong)) return;
            // The src attribute changes before the media decoder switches away
            // from the old resource. Require currentSrc to identify that decoder.
            if (!audio.currentSrc || (audio.currentSrc !== state.audioSrc &&
                audio.currentSrc !== new URL(state.audioSrc, document.baseURI).href)) return;
            // Repeated song URLs need a real reload/backward seek, not a queue refresh or unpause.
            if (!reset && state.audioSrc === previousSource && audio.currentTime >= previousTime - 0.05) return;
            finish(undefined, { song: state.currentSong, source: state.audioSrc, occurrence: key });
        };
        const onReset = () => { check(); reset = true; startedSource = null; };
        const onStarted = () => { check(); startedSource = usePlaybackStore.getState().audioSrc; check(); };
        const onAbort = () => finish(signal.reason);
        dispose.push(usePlaybackStore.subscribe(check), useExternalQueueStore.subscribe(check), subscribeExternalPlayback(check));
        for (const event of ['emptied', 'loadstart']) {
            audio.addEventListener(event, onReset);
            dispose.push(() => audio.removeEventListener(event, onReset));
        }
        for (const event of ['playing', 'seeked']) {
            audio.addEventListener(event, onStarted);
            dispose.push(() => audio.removeEventListener(event, onStarted));
        }
        signal.addEventListener('abort', onAbort, { once: true });
        dispose.push(() => signal.removeEventListener('abort', onAbort));
        check();
    });
}

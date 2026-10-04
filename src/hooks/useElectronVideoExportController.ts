import { captureExternalPlaybackBoundary, hasExternalPlayback, subscribeExternalPlayback } from '../services/externalPlaybackSession';
import { useExternalQueueStore } from '../services/externalPlaybackQueue';
import { getVideoExportRoomOccurrence, waitForNextVideoExportTrack } from '../services/videoExportNextTrack';
import { captureVideoExportPlayback } from '../services/videoExportPlayback';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { RemoteControlCommand } from '../types/remoteControl';
import type { VideoExportPreset, VideoExportState, VideoExportStartMode } from '../types/videoExport';
import { idleVideoExportState } from '../types/videoExport';
import {
    buildDefaultVideoExportFileName,
    createCroppedVideoStream,
    getAudioElementCaptureStream,
    getMainWindowVideoCaptureStream,
    getVideoExportRecorderOptions,
    getSupportedVideoExportFormat,
    installVideoExportCursorGuard,
    stopMediaStream,
    wait,
} from '../services/electronVideoExport';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAppChromeStore } from '../stores/useAppChromeStore';
import { setIsPanelOpen } from '../stores/useAppViewStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// src/hooks/useElectronVideoExportController.ts
// Records the real player window so audio.currentTime remains the single animation clock.
type UseElectronVideoExportControllerOptions = {
    isElectronWindow: boolean;
    audioRef: RefObject<HTMLAudioElement | null>;
    navigateToPlayer: () => void;
    pausePlayback: () => void;
    resumePlayback: () => Promise<void>;
};

const COUNTDOWN_SECONDS = 3;

const toArrayBuffer = (blob: Blob) => blob.arrayBuffer();

export const useElectronVideoExportController = ({
    isElectronWindow,
    audioRef,
    navigateToPlayer,
    pausePlayback,
    resumePlayback,
}: UseElectronVideoExportControllerOptions) => {
    // Read here rather than passed in: store fields, a module-level motion signal, or i18n.
    const { t } = useTranslation();
    const currentSong = usePlaybackStore(state => state.currentSong);
    const setIsPlayerChromeHidden = useAppChromeStore(state => state.setIsPlayerChromeHidden);

    const [exportState, setExportState] = useState<VideoExportState>(idleVideoExportState);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const cancelRequestedRef = useRef(false);
    const runningRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    const stopActiveExport = useCallback((discard: boolean) => {
        const recorder = recorderRef.current;
        cancelRequestedRef.current = discard || !recorder;
        if (!recorder || discard) abortRef.current?.abort();
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
    }, []);

    const startExport = useCallback(async (preset: VideoExportPreset, requestedMode: VideoExportStartMode) => {
        if (!isElectronWindow || runningRef.current) {
            return;
        }
        const passive = hasExternalPlayback();
        // Older remote selections must never rewind a synchronized room.
        const startMode = passive && requestedMode === 'from-start' ? 'next' : requestedMode;
        if (startMode === 'next' && !passive) {
            setExportState({ ...idleVideoExportState(), status: 'error', presetId: preset.id, error: t('export.nextSongRequiresSession') });
            return;
        }
        const isAudition = () => {
            const view = useExternalQueueStore.getState().view;
            return Boolean(view?.stopAction || view?.resumeActionId);
        };
        if (startMode === 'next' && isAudition()) {
            setExportState({ ...idleVideoExportState(), status: 'error', presetId: preset.id,
                error: t('export.nextSongRequiresRoomPlayback') });
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement || !currentSong) {
            setExportState({
                ...idleVideoExportState(),
                status: 'error',
                presetId: preset.id,
                error: t('export.noRecordableContent'),
            });
            return;
        }

        const electron = window.electron;
        if (!electron?.chooseVideoExportPath || !electron.getMainWindowCaptureSource || !electron.prepareVideoExportWindow || !electron.restoreVideoExportWindow || !electron.writeVideoExportFile) {
            setExportState({
                ...idleVideoExportState(),
                status: 'error',
                presetId: preset.id,
                error: t('export.windowRecordingUnsupported'),
            });
            return;
        }

        runningRef.current = true;
        cancelRequestedRef.current = false;
        let videoStream: MediaStream | null = null;
        let audioStream: MediaStream | null = null;
        let combinedStream: MediaStream | null = null;
        let progressIntervalId: number | null = null;
        let endedListener: (() => void) | null = null;
        let removeCursorGuard: (() => void) | null = null;
        let canvasCropCleanup: (() => void) | null = null;
        const abort = new AbortController();
        abortRef.current = abort;
        const sameSession = captureExternalPlaybackBoundary(), initialOccurrence = getVideoExportRoomOccurrence();
        let waitingForNext = false;
        let playback = startMode === 'next' ? null
            : captureVideoExportPlayback(audioElement, () => audioRef.current, pausePlayback, resumePlayback);
        const onPlaybackChanged = () => {
            const recorder = recorderRef.current;
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            else abort.abort(new Error(t('export.playbackChanged')));
        };
        const checkPreparation = () => {
            if (!sameSession() || audioRef.current !== audioElement) onPlaybackChanged();
            else if (startMode === 'next' && !playback && isAudition())
                abort.abort(new Error(t('export.nextSongRequiresRoomPlayback')));
            else if (startMode === 'next' && !waitingForNext && getVideoExportRoomOccurrence() !== initialOccurrence)
                abort.abort(new Error(t('export.nextSongPreparationChanged')));
        };
        let stopObserving = playback?.subscribe(onPlaybackChanged);
        const stopSession = subscribeExternalPlayback(checkPreparation);
        const stopQueue = useExternalQueueStore.subscribe(checkPreparation);
        const assertCurrent = () => {
            if (cancelRequestedRef.current) throw new Error(t('export.recordingCancelled'));
            if (abort.signal.aborted) throw abort.signal.reason;
            if (!sameSession() || audioRef.current !== audioElement || (playback && !playback.isCurrent()))
                throw new Error(t('export.playbackChanged'));
        };

        try {
            assertCurrent();
            const exportFormat = getSupportedVideoExportFormat();
            if (!exportFormat) {
                throw new Error(t('export.noExportCodec'));
            }

            let recordedSong = currentSong;
            const choosePath = () => electron.chooseVideoExportPath(
                buildDefaultVideoExportFileName(recordedSong, preset, exportFormat.extension),
                exportFormat.extension, exportFormat.displayName,
            );
            // Synchronized playback cannot wait for a save dialog. Select after
            // capture, using the title of the song actually recorded.
            let saveResult = passive ? null : await choosePath();
            if (saveResult && (saveResult.canceled || !saveResult.filePath)) {
                setExportState(idleVideoExportState());
                return;
            }
            assertCurrent();
            let exportStartTime = 0, exportDuration = 0;
            setExportState({ ...idleVideoExportState(), status: 'preparing', presetId: preset.id,
                filePath: saveResult?.filePath ?? null });

            navigateToPlayer();
            setIsPanelOpen(false);
            setIsPlayerChromeHidden(true);
            removeCursorGuard = installVideoExportCursorGuard();
            playback?.prepare(startMode);

            const prepared = await electron.prepareVideoExportWindow({ width: preset.width, height: preset.height });
            if (prepared === false || !prepared.success) {
                throw new Error(t('export.windowResizeFailed'));
            }
            assertCurrent();
            if (!passive) await wait(300);
            assertCurrent();
            videoStream = await getMainWindowVideoCaptureStream(preset);
            assertCurrent();

            // Canvas post-processing: pure integer crop to exact preset resolution.
            // The snap strategy in main.cjs ensures contentPhys >= preset + margin,
            // so the captured frame is naturally larger than the target — we simply
            // extract a preset-sized region with symmetric pixel-perfect cropping.
            const cropped = createCroppedVideoStream(videoStream, preset);
            videoStream = cropped.stream;
            canvasCropCleanup = cropped.cleanup;

            if (startMode === 'next') {
                assertCurrent();
                waitingForNext = true;
                setExportState(prev => ({ ...prev, status: 'waiting' }));
                const next = await waitForNextVideoExportTrack(audioElement,
                    () => sameSession() && audioRef.current === audioElement, abort.signal, initialOccurrence,
                    new Error(t('export.playbackChanged')));
                assertCurrent();
                const current = usePlaybackStore.getState();
                if (getVideoExportRoomOccurrence() !== next.occurrence || current.audioSrc !== next.source ||
                    !current.currentSong || getPlaybackSongKey(current.currentSong) !== getPlaybackSongKey(next.song))
                    throw new Error(t('export.playbackChanged'));
                playback = captureVideoExportPlayback(audioElement, () => audioRef.current, pausePlayback, resumePlayback);
                stopObserving = playback.subscribe(onPlaybackChanged);
                recordedSong = next.song;
            }
            assertCurrent();
            // Acquire the new audio track after loading: captureStream tracks from
            // the outgoing source can end when its source is replaced.
            audioStream = getAudioElementCaptureStream(audioElement);
            combinedStream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...audioStream.getAudioTracks(),
            ]);

            if (!passive) {
                for (let remaining = COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
                    setExportState(prev => ({ ...prev, status: 'countdown', countdown: remaining }));
                    await wait(1000);
                    assertCurrent();
                }
            }

            // Passive capture observes the actual start time without seeking,
            // pausing or resuming the externally owned playback session.
            exportStartTime = startMode === 'from-start' ? 0 : Math.max(0, audioElement.currentTime);
            const duration = usePlaybackStore.getState().duration;
            const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : audioElement.duration;
            exportDuration = Number.isFinite(safeDuration) && safeDuration > exportStartTime
                ? safeDuration - exportStartTime : 0;

            const chunks: Blob[] = [];
            const recorder = new MediaRecorder(combinedStream, getVideoExportRecorderOptions(preset, exportFormat));
            recorderRef.current = recorder;
            const stopped = new Promise<void>((resolve, reject) => {
                recorder.ondataavailable = event => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                    }
                };
                recorder.onerror = () => reject(new Error(t('export.recorderUnknownError')));
                recorder.onstop = () => resolve();
            });
            const requestStop = () => {
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                }
            };
            endedListener = requestStop;
            audioElement.addEventListener('ended', requestStop, { once: true });

            recorder.start(1000);
            setExportState(prev => ({
                ...prev,
                status: 'recording',
                countdown: null,
                duration: exportDuration,
            }));
            await playback!.resume();

            progressIntervalId = window.setInterval(() => {
                if (!playback!.isCurrent()) { requestStop(); return; }
                const elapsed = Math.max(0, audioElement.currentTime - exportStartTime);
                const progress = exportDuration > 0 ? Math.min(1, elapsed / exportDuration) : 0;
                setExportState(prev => ({
                    ...prev,
                    status: 'recording',
                    elapsed,
                    progress,
                }));

                if (exportDuration > 0 && elapsed >= exportDuration - 0.12) {
                    requestStop();
                }
            }, 250);

            await stopped;

            if (progressIntervalId !== null) {
                window.clearInterval(progressIntervalId);
                progressIntervalId = null;
            }

            if (cancelRequestedRef.current) {
                setExportState(idleVideoExportState());
                return;
            }

            setExportState(prev => ({
                ...prev,
                status: 'finalizing',
                progress: 1,
                elapsed: exportDuration,
            }));
            if (!saveResult) saveResult = await choosePath();
            if (cancelRequestedRef.current || saveResult.canceled || !saveResult.filePath) {
                setExportState(idleVideoExportState());
                return;
            }
            const blob = new Blob(chunks, { type: exportFormat.mimeType });
            await electron.writeVideoExportFile(saveResult.filePath, await toArrayBuffer(blob));
            setExportState(prev => ({
                ...prev,
                status: 'done',
                progress: 1,
                elapsed: exportDuration,
                filePath: saveResult.filePath,
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setExportState({
                ...idleVideoExportState(),
                status: cancelRequestedRef.current ? 'idle' : 'error',
                presetId: preset.id,
                error: cancelRequestedRef.current ? null : message,
            });
        } finally {
            if (progressIntervalId !== null) {
                window.clearInterval(progressIntervalId);
            }
            if (endedListener) {
                audioElement.removeEventListener('ended', endedListener);
            }
            stopObserving?.();
            stopSession();
            stopQueue();
            abort.abort();
            if (abortRef.current === abort) abortRef.current = null;
            if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
            recorderRef.current = null;
            stopMediaStream(videoStream);
            stopMediaStream(audioStream);
            stopMediaStream(combinedStream);
            playback?.restore();
            setIsPlayerChromeHidden(false);
            removeCursorGuard?.();
            canvasCropCleanup?.();
            void electron.restoreVideoExportWindow();
            runningRef.current = false;
            cancelRequestedRef.current = false;
        }
    }, [audioRef, currentSong, isElectronWindow, navigateToPlayer, pausePlayback, resumePlayback, setIsPanelOpen, setIsPlayerChromeHidden]);

    const handleExportCommand = useCallback((command: RemoteControlCommand) => {
        if (command.type === 'start-export') {
            void startExport(command.preset, command.startMode);
            return true;
        }

        if (command.type === 'stop-export') {
            stopActiveExport(false);
            return true;
        }

        if (command.type === 'cancel-export') {
            stopActiveExport(true);
            return true;
        }

        return false;
    }, [startExport, stopActiveExport]);

    // Automatically reset export status back to 'idle' after completion (3s) or error (4s)
    useEffect(() => {
        if (exportState.status === 'done') {
            const timer = window.setTimeout(() => {
                setExportState(prev => prev.status === 'done' ? idleVideoExportState() : prev);
            }, 3000);
            return () => window.clearTimeout(timer);
        }
        if (exportState.status === 'error') {
            const timer = window.setTimeout(() => {
                setExportState(prev => prev.status === 'error' ? idleVideoExportState() : prev);
            }, 4000);
            return () => window.clearTimeout(timer);
        }
    }, [exportState.status]);

    useEffect(() => () => {
        stopActiveExport(true);
    }, [stopActiveExport]);

    return {
        exportState,
        isExportRunning: () => runningRef.current,
        handleExportCommand,
    };
};

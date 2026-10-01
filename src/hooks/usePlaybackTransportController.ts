import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { PlayerState } from '../types';
import { setStatusMessage as setStatusMsg } from '../stores/useStatusMessageStore';
import { setPlayerState } from '../stores/usePlaybackStore';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { currentTime } from '../stores/motionSignals';
import { captureExternalPlaybackBoundary } from '../services/externalPlaybackSession';

// src/hooks/usePlaybackTransportController.ts

type UsePlaybackTransportControllerParams = {
    stageActiveEntryKind: string | null;
    isNowPlayingStageActive: boolean;
    audioRef: RefObject<HTMLAudioElement | null>;
    audioContextRef: MutableRefObject<AudioContext | null>;
    stageLyricsClockRef: MutableRefObject<{
        startTimeSec: number;
        endTimeSec: number;
        baseTimeSec: number;
        startedAtMs: number | null;
    }>;
    setupAudioAnalyzer: () => void;
    syncOutputGain: (targetVolume: number, smoothing?: number) => void;
    getTargetPlaybackVolume: () => number;
    shouldRefreshCurrentOnlineAudioSource: () => boolean;
    recoverOnlinePlaybackSource: (options: {
        failedSrc?: string | null;
        resumeAt?: number;
        autoplay: boolean;
        shouldAutoplay?: () => boolean;
    }) => Promise<boolean>;
    getSyntheticStageLyricsTime: () => number;
    syncStageLyricsClock: (timeSec: number, endTimeSec: number, nextPlayerState: PlayerState, startTimeSec?: number) => void;
    /**
     * Handles a pause that lands during an automix blend, returning true when it did.
     *
     * Mid-blend `audioRef` names the deck the next track is ARRIVING on, so the pause below would
     * stop a deck the listener cannot hear and leave the one they can hear playing on into the
     * next song - "I pressed pause and it jumped to the next track". This cancels the blend back
     * onto the deck still sounding the displayed track and pauses that, the same cancel a mid-blend
     * seek uses. Returns false (and the ordinary pause runs) when no blend is in flight.
     */
    pauseDuringTransition?: () => boolean;
};

// Owns play and pause transport behavior across main playback and Stage lyric-only playback.
export function usePlaybackTransportController({
    stageActiveEntryKind,
    isNowPlayingStageActive,
    audioRef,
    audioContextRef,
    stageLyricsClockRef,
    setupAudioAnalyzer,
    syncOutputGain,
    getTargetPlaybackVolume,
    shouldRefreshCurrentOnlineAudioSource,
    recoverOnlinePlaybackSource,
    getSyntheticStageLyricsTime,
    syncStageLyricsClock,
    pauseDuringTransition,
}: UsePlaybackTransportControllerParams) {
    // Read here rather than passed in: store fields, a module-level motion signal, or i18n.
    const { t } = useTranslation();
    const activePlaybackContext = usePlaybackStore(state => state.activePlaybackContext);
    const audioSrc = usePlaybackStore(state => state.audioSrc);
    const duration = usePlaybackStore(state => state.duration);
    const transportRevision = useRef(0);
    const wantsPlayback = useRef(false);
    useEffect(() => () => {
        transportRevision.current++;
        wantsPlayback.current = false;
    }, []);

    const resumePlayback = useCallback(async () => {
        if (isNowPlayingStageActive) {
            return;
        }
        const revision = ++transportRevision.current;
        wantsPlayback.current = true;

        if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
            const currentSyntheticTime = getSyntheticStageLyricsTime();
            syncStageLyricsClock(currentSyntheticTime, duration, PlayerState.PLAYING, stageLyricsClockRef.current.startTimeSec);
            currentTime.set(currentSyntheticTime);
            setPlayerState(PlayerState.PLAYING);
            return;
        }

        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        // A pause does not cancel source loading, but it must cancel an older
        // asynchronous resume. Store notifications alone cannot identify that
        // stale PLAYING event once a caller has already observed PAUSED.
        const boundary = captureExternalPlaybackBoundary();
        const source = usePlaybackStore.getState().audioSrc;
        const isSameSource = () => boundary()
            && audioRef.current === audio && usePlaybackStore.getState().audioSrc === source;
        const isCurrent = () => revision === transportRevision.current && isSameSource();
        // A pending refresh can still supply the source after a pause. Its autoplay
        // decision follows the latest transport intent, including a later resume.
        const shouldAutoplay = () => wantsPlayback.current && isSameSource();

        setupAudioAnalyzer();
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            try {
                await audioContextRef.current.resume();
            } catch (error) {
                if (!isCurrent()) return;
                throw error;
            }
        }
        if (!isCurrent()) return;

        syncOutputGain(getTargetPlaybackVolume(), 0);
        if (shouldRefreshCurrentOnlineAudioSource()) {
            const refreshed = await recoverOnlinePlaybackSource({
                failedSrc: audio.currentSrc || audioSrc,
                resumeAt: audio.currentTime,
                autoplay: true,
                shouldAutoplay,
            });

            if (!isCurrent() || refreshed) {
                return;
            }
        }

        try {
            await audio.play();
            if (!isCurrent()) return;
            setPlayerState(PlayerState.PLAYING);
        } catch (error) {
            if (!isCurrent()) return;
            const recovered = await recoverOnlinePlaybackSource({
                failedSrc: audio.currentSrc || audioSrc,
                resumeAt: audio.currentTime,
                autoplay: true,
                shouldAutoplay,
            });

            if (!isCurrent() || recovered) {
                return;
            }

            if (!audio.paused && !audio.ended) {
                setPlayerState(PlayerState.PLAYING);
                return;
            }

            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                setStatusMsg({ type: 'info', text: t('status.clickToPlay') });
                setPlayerState(PlayerState.PAUSED);
                return;
            }

            setStatusMsg({ type: 'error', text: t('status.playbackError') });
            setPlayerState(PlayerState.PAUSED);
            throw error;
        }
    }, [activePlaybackContext, audioContextRef, audioRef, audioSrc, currentTime, duration, getSyntheticStageLyricsTime, getTargetPlaybackVolume, isNowPlayingStageActive, recoverOnlinePlaybackSource, setPlayerState, setStatusMsg, setupAudioAnalyzer, shouldRefreshCurrentOnlineAudioSource, stageActiveEntryKind, stageLyricsClockRef, syncOutputGain, syncStageLyricsClock, t]);

    const pausePlayback = useCallback(() => {
        if (isNowPlayingStageActive) {
            return;
        }
        transportRevision.current++;
        wantsPlayback.current = false;

        if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
            const currentSyntheticTime = getSyntheticStageLyricsTime();
            syncStageLyricsClock(currentSyntheticTime, duration, PlayerState.PAUSED, stageLyricsClockRef.current.startTimeSec);
            currentTime.set(currentSyntheticTime);
            setPlayerState(PlayerState.PAUSED);
            return;
        }

        // Before the element is touched, because mid-blend `audioRef` is the wrong element to touch:
        // it names the deck the next track is arriving on. The cancel pauses the deck that is
        // actually sounding, so there is nothing left here but to settle the transport.
        if (pauseDuringTransition?.()) {
            syncOutputGain(getTargetPlaybackVolume(), 0);
            setPlayerState(PlayerState.PAUSED);
            return;
        }

        if (!audioRef.current) {
            return;
        }

        audioRef.current.pause();
        syncOutputGain(getTargetPlaybackVolume(), 0);
        setPlayerState(PlayerState.PAUSED);
    }, [activePlaybackContext, audioRef, audioSrc, currentTime, duration, getSyntheticStageLyricsTime, getTargetPlaybackVolume, isNowPlayingStageActive, pauseDuringTransition, setPlayerState, stageActiveEntryKind, stageLyricsClockRef, syncOutputGain, syncStageLyricsClock]);

    return {
        resumePlayback,
        pausePlayback,
    };
}

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useElectronVideoExportController } from '@/hooks/useElectronVideoExportController';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useExternalQueueStore } from '@/services/externalPlaybackQueue';
import { acquireExternalPlayback, hasExternalPlayback, releaseAllExternalPlayback } from '@/services/externalPlaybackSession';
import { PlayerState, type SongResult } from '@/types';
import { VIDEO_EXPORT_PRESETS } from '@/types/videoExport';
import type { VideoExportStartMode } from '@/types/videoExport';

// test/unit/playback/videoExportSession.test.ts
const io = vi.hoisted(() => ({
    choose: vi.fn(), prepare: vi.fn(), restore: vi.fn(), write: vi.fn(), wait: vi.fn(),
    video: vi.fn(), audio: vi.fn(), crop: vi.fn(), cleanup: vi.fn(), cursor: vi.fn(), chrome: vi.fn(),
}));
vi.hoisted(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: () => null, setItem() {}, removeItem() {},
    } });
});
vi.mock('react-i18next', async importOriginal => ({
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/useAppViewStore', () => ({ setIsPanelOpen: vi.fn() }));
vi.mock('@/stores/useAppChromeStore', () => ({
    useAppChromeStore: (select: (state: unknown) => unknown) => select({ setIsPlayerChromeHidden: io.chrome }),
}));
vi.mock('@/services/electronVideoExport', () => ({
    buildDefaultVideoExportFileName: (song: SongResult) => `${song.name}.webm`,
    getSupportedVideoExportFormat: () => ({ mimeType: 'video/webm', extension: 'webm', displayName: 'WebM' }),
    getVideoExportRecorderOptions: () => ({ mimeType: 'video/webm' }),
    installVideoExportCursorGuard: () => io.cursor,
    getMainWindowVideoCaptureStream: io.video,
    getAudioElementCaptureStream: io.audio,
    createCroppedVideoStream: io.crop,
    wait: io.wait,
    stopMediaStream: (stream: MediaStream | null) => stream?.getTracks().forEach(track => track.stop()),
}));

class Stream {
    constructor(private tracks: { kind: string; stop(): void }[]) {}
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
}
class Recorder {
    static instances: Recorder[] = [];
    state = 'inactive';
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    constructor(readonly stream: MediaStream) { Recorder.instances.push(this); }
    start() { this.state = 'recording'; }
    stop = vi.fn(() => {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['recorded-video']) });
        this.onstop?.();
    });
}
const song = { id: 'track', name: 'Room song', artists: [], album: { id: 'a', name: 'Album' }, durationMs: 120000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'track' } } as SongResult;
let root: Root | null = null;
const originalPlayback = usePlaybackStore.getState();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Recorder.instances = [];
    vi.stubGlobal('MediaStream', Stream);
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('Blob', NodeBlob);
    window.electron = {
        chooseVideoExportPath: io.choose,
        getMainWindowCaptureSource: vi.fn(),
        prepareVideoExportWindow: io.prepare,
        restoreVideoExportWindow: io.restore,
        writeVideoExportFile: io.write,
    } as unknown as typeof window.electron;
    io.choose.mockResolvedValue({ canceled: false, filePath: '/recorded.webm' });
    io.prepare.mockResolvedValue({ success: true });
    io.restore.mockResolvedValue(true);
    io.write.mockResolvedValue(true);
    io.video.mockResolvedValue(new Stream([{ kind: 'video', stop: vi.fn() }]));
    io.audio.mockReturnValue(new Stream([{ kind: 'audio', stop: vi.fn() }]));
    io.crop.mockImplementation((stream: Stream) => ({ stream, cleanup: io.cleanup }));
    io.wait.mockResolvedValue(undefined);
    usePlaybackStore.setState({ currentSong: song, audioSrc: 'room-source', duration: 120, playerState: PlayerState.PLAYING });
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    releaseAllExternalPlayback();
    useExternalQueueStore.setState({ view: null });
    usePlaybackStore.setState(originalPlayback, true);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
function session(occurrence = 'first') {
    const dispatch = vi.fn(), owner = acquireExternalPlayback({ modId: 'room', dispatch, cleanup: vi.fn(), report: vi.fn() });
    const update = (entry: string, audition = false, playingSong = song) => useExternalQueueStore.setState({ view: {
        owner, items: new Map(), queue: [], currentSong: { ...playingSong, externalQueueEntryKey: entry },
        actions: [], totalCount: 1, loading: false, canNext: true,
        stopAction: audition ? { id: 'stop-preview', icon: 'square', label: { en: 'Stop' } } : undefined,
    } });
    update(occurrence);
    return { dispatch, update };
}
function mount(paused = false) {
    let time = 10, loop = true;
    const writeTime = vi.fn((value: number) => { time = value; }),
        writeLoop = vi.fn((value: boolean) => { loop = value; }),
        audio = Object.assign(new EventTarget(), { paused, ended: false, seeking: false, readyState: 4,
            currentSrc: 'room-source', src: 'room-source', duration: 120, pause: vi.fn(),
            getAttribute: (_name: string) => audio.src,
        });
    Object.defineProperties(audio, {
        currentTime: { get: () => time, set: writeTime },
        loop: { get: () => loop, set: writeLoop },
    });
    const params = {
        isElectronWindow: true, audioRef: { current: audio as unknown as HTMLAudioElement },
        navigateToPlayer: vi.fn(), pausePlayback: vi.fn(), resumePlayback: vi.fn(async () => {}),
    };
    let controls!: ReturnType<typeof useElectronVideoExportController>;
    function Probe() { controls = useElectronVideoExportController(params); return null; }
    root = createRoot(document.createElement('div'));
    act(() => root!.render(React.createElement(Probe)));
    const command = async (type: 'start-export' | 'stop-export' | 'cancel-export', startMode: VideoExportStartMode = 'current') => {
        await act(async () => {
            controls.handleExportCommand(type === 'start-export'
                ? { type, preset: VIDEO_EXPORT_PRESETS[0], startMode } : { type });
            await flush();
        });
    };
    return { params, audio, writeTime, writeLoop, command, controls: () => controls,
        advance: (seconds: number) => { time += seconds; },
        setTime: (seconds: number) => { time = seconds; } };
}

it.each(['stop-export', 'cancel-export'] as const)('records a session from now without transport writes through %s', async (stop) => {
    const room = session(), view = mount(true);
    io.wait.mockImplementation(async (ms: number) => view.advance(ms / 1000));
    await view.command('start-export');
    expect(view.controls().exportState.status).toBe('recording');
    expect(view.controls().exportState.duration).toBeCloseTo(110);
    expect(io.wait).not.toHaveBeenCalled();
    expect(io.choose).not.toHaveBeenCalled();
    await view.command(stop);
    expect(view.controls().isExportRunning()).toBe(false);
    expect(view.params.pausePlayback).not.toHaveBeenCalled();
    expect(view.params.resumePlayback).not.toHaveBeenCalled();
    expect(view.audio.pause).not.toHaveBeenCalled();
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(view.writeLoop).not.toHaveBeenCalled();
    expect(room.dispatch).not.toHaveBeenCalled();
    expect(hasExternalPlayback()).toBe(true);
    expect(io.write).toHaveBeenCalledTimes(stop === 'stop-export' ? 1 : 0);
});

it('maps stale full-song commands to waiting for the next room song', async () => {
    session();
    const view = mount();
    await view.command('start-export', 'from-start');
    expect(view.controls().exportState.status).toBe('waiting');
    expect(io.choose).not.toHaveBeenCalled();
    expect(view.params.pausePlayback).not.toHaveBeenCalled();
    await view.command('cancel-export');
});

it('cleans up a failed recorder without seeking or pausing the room', async () => {
    session();
    const view = mount(true);
    await view.command('start-export');
    await act(async () => { Recorder.instances[0].onerror?.(); await flush(); });
    expect(view.controls().exportState.error).toBe('export.recorderUnknownError');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(Recorder.instances[0].state).toBe('inactive');
    expect(view.params.pausePlayback).not.toHaveBeenCalled();
    expect(view.params.resumePlayback).not.toHaveBeenCalled();
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(view.writeLoop).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
});

it('abandons a pending local recording when a room takes over during the save dialog', async () => {
    let resolve!: (value: unknown) => void;
    io.choose.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = mount(true);
    await view.command('start-export', 'from-start');
    await act(async () => {
        session();
        resolve({ canceled: false, filePath: '/old-song.webm' });
        await flush();
    });
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(io.prepare).not.toHaveBeenCalled();
    expect(view.params.pausePlayback).not.toHaveBeenCalled();
    expect(view.params.resumePlayback).not.toHaveBeenCalled();
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(view.writeLoop).not.toHaveBeenCalled();
});

it('cancels setup when playback changes during capture preparation without restoring the old position', async () => {
    session();
    const view = mount(true);
    const stream = await io.video();
    io.video.mockImplementation(async () => {
        usePlaybackStore.setState({ audioSrc: 'new-room-source' });
        return stream;
    });
    await view.command('start-export');
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(Recorder.instances).toHaveLength(0);
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(view.writeLoop).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
});

it('does not start a zero-duration capture after a room song ends during capture preparation', async () => {
    session();
    const view = mount();
    const stream = await io.video();
    io.video.mockImplementation(async () => {
        view.advance(110);
        view.audio.ended = true;
        view.audio.dispatchEvent(new Event('ended'));
        return stream;
    });
    await view.command('start-export');
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(Recorder.instances).toHaveLength(0);
    expect(io.write).not.toHaveBeenCalled();
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(view.writeLoop).not.toHaveBeenCalled();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(hasExternalPlayback()).toBe(true);
});

it('rejects a room track that is already ended before opening the save dialog', async () => {
    session();
    const view = mount();
    view.audio.ended = true;
    await view.command('start-export');
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(io.choose).not.toHaveBeenCalled();
    expect(Recorder.instances).toHaveLength(0);
});

it('stops and saves unknown-duration room playback on its natural ended event', async () => {
    session();
    usePlaybackStore.setState({ duration: 0 });
    const view = mount();
    view.audio.duration = NaN;
    await view.command('start-export');
    expect(view.controls().exportState.status).toBe('recording');
    expect(view.controls().exportState.duration).toBe(0);
    await act(async () => {
        view.audio.ended = true;
        view.audio.dispatchEvent(new Event('ended'));
        await flush();
    });
    expect(Recorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(view.controls().exportState.status).toBe('done');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(io.write).toHaveBeenCalledOnce();
    expect(view.writeTime).not.toHaveBeenCalled();
});

it('stops and saves on a new occurrence even when the song and source are unchanged', async () => {
    const room = session(), view = mount();
    await view.command('start-export');
    await act(async () => { room.update('second'); await flush(); });
    expect(Recorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(view.controls().exportState.status).toBe('done');
    expect(io.write).toHaveBeenCalledOnce();
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(hasExternalPlayback()).toBe(true);
});

it('records auditions independently of room advancement, then stops when returning to the room', async () => {
    const room = session();
    room.update('first', true);
    const view = mount();
    await view.command('start-export');
    await act(async () => { room.update('second', true); await flush(); });
    expect(Recorder.instances[0].stop).not.toHaveBeenCalled();
    await act(async () => { room.update('second'); await flush(); });
    expect(Recorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(io.write).toHaveBeenCalledOnce();
});

it.each([false, true])('retains normal full-song recording and paused restoration when ended=%s', async (ended) => {
    const view = mount(true);
    view.audio.ended = ended;
    await view.command('start-export', 'from-start');
    expect(view.params.pausePlayback).toHaveBeenCalledOnce();
    expect(view.params.resumePlayback).toHaveBeenCalledOnce();
    expect(view.writeTime).toHaveBeenCalledWith(0);
    await view.command('stop-export');
    expect(view.writeTime).toHaveBeenLastCalledWith(10);
    expect(view.writeLoop.mock.calls).toEqual([[false], [true]]);
});

const nextSong = { ...song, id: 'next-track', name: 'Next room song',
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'next-track' } } as SongResult;

async function startNextSong(view: ReturnType<typeof mount>, room: ReturnType<typeof session>, repeated = false) {
    await act(async () => {
        const playingSong = repeated ? song : nextSong;
        room.update('second', false, playingSong);
        usePlaybackStore.setState({ currentSong: playingSong, audioSrc: repeated ? 'room-source' : 'next-source' });
        view.audio.src = view.audio.currentSrc = repeated ? 'room-source' : 'next-source';
        view.setTime(0);
        view.audio.ended = false;
        view.audio.paused = false;
        view.audio.dispatchEvent(new Event(repeated ? 'seeked' : 'playing'));
        await flush();
    });
}

it('waits for the next real media source and captures its audio track and filename', async () => {
    const room = session(), view = mount();
    const freshAudioTrack = { kind: 'audio', stop: vi.fn() };
    await view.command('start-export', 'next');
    expect(view.controls().exportState.status).toBe('waiting');
    expect(io.audio).not.toHaveBeenCalled();
    expect(io.choose).not.toHaveBeenCalled();
    await act(async () => {
        room.update('second', false, nextSong);
        // Room metadata is published before the old audio element has been replaced.
        usePlaybackStore.setState({ currentSong: nextSong });
        view.audio.dispatchEvent(new Event('playing'));
        await flush();
    });
    expect(Recorder.instances).toHaveLength(0);
    io.audio.mockReturnValue(new Stream([freshAudioTrack]));
    await act(async () => {
        usePlaybackStore.setState({ audioSrc: 'next-source' });
        view.audio.src = view.audio.currentSrc = 'next-source';
        view.setTime(0);
        await flush();
    });
    expect(Recorder.instances).toHaveLength(0);
    await act(async () => {
        // A new src attribute can still have an old decoder/resource behind it.
        view.audio.currentSrc = 'room-source';
        view.audio.dispatchEvent(new Event('playing'));
        await flush();
    });
    expect(Recorder.instances).toHaveLength(0);
    view.audio.currentSrc = 'next-source';
    await act(async () => { view.audio.dispatchEvent(new Event('playing')); await flush(); });
    expect(view.controls().exportState.status).toBe('recording');
    expect(Recorder.instances[0].stream.getAudioTracks()).toEqual([freshAudioTrack]);
    expect(io.wait).not.toHaveBeenCalled();
    expect(view.controls().exportState.duration).toBe(120);
    await view.command('stop-export');
    expect(io.choose).toHaveBeenCalledExactlyOnceWith('Next room song.webm', 'webm', 'WebM');
    expect(io.write).toHaveBeenCalledOnce();
    expect(view.params.pausePlayback).not.toHaveBeenCalled();
    expect(view.params.resumePlayback).not.toHaveBeenCalled();
    expect(view.writeTime).not.toHaveBeenCalled();
    expect(view.writeLoop).not.toHaveBeenCalled();
    expect(room.dispatch).not.toHaveBeenCalled();
});

it('requires an actual restart for a repeated song with the same URL', async () => {
    const room = session(), view = mount();
    await view.command('start-export', 'next');
    await act(async () => {
        room.update('second');
        view.audio.dispatchEvent(new Event('playing'));
        await flush();
    });
    expect(Recorder.instances).toHaveLength(0);
    await act(async () => {
        view.setTime(0);
        view.audio.dispatchEvent(new Event('seeked'));
        await flush();
    });
    expect(view.controls().exportState.status).toBe('recording');
    await view.command('stop-export');
    expect(io.write).toHaveBeenCalledOnce();
    expect(view.writeTime).not.toHaveBeenCalled();
});

it('does not substitute a third occurrence between media readiness and recorder creation', async () => {
    const room = session(), view = mount();
    await view.command('start-export', 'next');
    await act(async () => {
        room.update('second', false, nextSong);
        usePlaybackStore.setState({ currentSong: nextSong, audioSrc: 'next-source' });
        view.audio.src = view.audio.currentSrc = 'next-source';
        view.setTime(0);
        view.audio.dispatchEvent(new Event('playing'));
        room.update('third');
        await flush();
    });
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(Recorder.instances).toHaveLength(0);
    expect(io.write).not.toHaveBeenCalled();
});

it.each(['stop-export', 'cancel-export'] as const)('cleans up waiting immediately on %s without saving or touching playback', async command => {
    const room = session(), view = mount();
    const stream = await io.video();
    await view.command('start-export', 'next');
    await view.command(command);
    expect(view.controls().exportState.status).toBe('idle');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(io.cleanup).toHaveBeenCalledOnce();
    expect(io.cursor).toHaveBeenCalledOnce();
    expect(io.restore).toHaveBeenCalledOnce();
    expect(io.chrome).toHaveBeenLastCalledWith(false);
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(io.choose).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
    await startNextSong(view, room);
    expect(Recorder.instances).toHaveLength(0);
    expect(view.params.pausePlayback).not.toHaveBeenCalled();
    expect(view.params.resumePlayback).not.toHaveBeenCalled();
    expect(room.dispatch).not.toHaveBeenCalled();
});

it('cancels waiting when the session is released or replaced', async () => {
    session();
    const view = mount();
    await view.command('start-export', 'next');
    await act(async () => { releaseAllExternalPlayback(); session('other-room'); await flush(); });
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(io.cleanup).toHaveBeenCalledOnce();
    expect(io.write).not.toHaveBeenCalled();
    expect(Recorder.instances).toHaveLength(0);
});

it('reports a switch during setup instead of silently waiting for the following song', async () => {
    const room = session(), view = mount();
    let prepared!: (value: unknown) => void;
    io.prepare.mockReturnValue(new Promise(resolve => { prepared = resolve; }));
    await view.command('start-export', 'next');
    expect(view.controls().exportState.status).toBe('preparing');
    await act(async () => {
        room.update('second');
        prepared({ success: true });
        await flush();
    });
    expect(view.controls().exportState.error).toBe('export.nextSongPreparationChanged');
    expect(io.video).not.toHaveBeenCalled();
    expect(io.choose).not.toHaveBeenCalled();
    expect(view.controls().isExportRunning()).toBe(false);
});

it.each([false, true])('does not skip an unavailable next occurrence, including an empty snapshot (%s)', async empty => {
    const room = session(), view = mount();
    await view.command('start-export', 'next');
    await act(async () => {
        room.update('second');
        if (empty) useExternalQueueStore.setState(state => ({ view: { ...state.view!, currentSong: null } }));
        room.update('third');
        await flush();
    });
    expect(view.controls().exportState.error).toBe('export.playbackChanged');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(Recorder.instances).toHaveLength(0);
});

it('allows waiting when the current room track already ended', async () => {
    const room = session(), view = mount();
    view.audio.ended = true;
    await view.command('start-export', 'next');
    expect(view.controls().exportState.status).toBe('waiting');
    await startNextSong(view, room);
    expect(view.controls().exportState.status).toBe('recording');
    await view.command('cancel-export');
});

it('cleans up a waiting export on unmount and ignores later room events', async () => {
    const room = session(), view = mount();
    await view.command('start-export', 'next');
    await act(async () => { root!.unmount(); root = null; await flush(); });
    expect(io.cleanup).toHaveBeenCalledOnce();
    expect(io.restore).toHaveBeenCalledOnce();
    await startNextSong(view, room);
    expect(Recorder.instances).toHaveLength(0);
    expect(io.write).not.toHaveBeenCalled();
});

it('discards next-song capture when its save dialog is cancelled', async () => {
    const room = session(), view = mount();
    await view.command('start-export', 'next');
    await startNextSong(view, room);
    io.choose.mockResolvedValue({ canceled: true, filePath: null });
    await view.command('stop-export');
    expect(view.controls().exportState.status).toBe('idle');
    expect(io.write).not.toHaveBeenCalled();
    expect(io.restore).toHaveBeenCalledOnce();
    expect(room.dispatch).not.toHaveBeenCalled();
    expect(hasExternalPlayback()).toBe(true);
});

it('preserves the normal countdown for ordinary From here recordings', async () => {
    const view = mount();
    await view.command('start-export', 'current');
    expect(io.wait.mock.calls).toEqual([[300], [1000], [1000], [1000]]);
    expect(view.controls().exportState.status).toBe('recording');
    await view.command('stop-export');
});

it('requires a room session for next-song recording', async () => {
    const view = mount();
    await view.command('start-export', 'next');
    expect(view.controls().exportState.error).toBe('export.nextSongRequiresSession');
    expect(io.prepare).not.toHaveBeenCalled();
});

it('rejects next-song recording during an audition and cancels waiting on audition entry', async () => {
    const room = session(), view = mount();
    await act(async () => { room.update('first', true); await flush(); });
    await view.command('start-export', 'next');
    expect(view.controls().exportState.error).toBe('export.nextSongRequiresRoomPlayback');
    expect(io.prepare).not.toHaveBeenCalled();
    await act(async () => { room.update('first'); await flush(); });
    await view.command('start-export', 'next');
    expect(view.controls().exportState.status).toBe('waiting');
    await act(async () => { room.update('first', true); await flush(); });
    expect(view.controls().exportState.error).toBe('export.nextSongRequiresRoomPlayback');
    expect(view.controls().isExportRunning()).toBe(false);
    expect(io.cleanup).toHaveBeenCalledOnce();
});

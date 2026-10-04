// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import RemoteVideoExportPanel from '@/components/remote/RemoteVideoExportPanel';
import { idleVideoExportState, VIDEO_EXPORT_PRESETS } from '@/types/videoExport';
import type { VideoExportStartMode, VideoExportStatus } from '@/types/videoExport';

// test/unit/remote/remoteVideoExportPanel.test.ts
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; });

function mount({
    isExternalSession = true,
    isAudition = false,
    startMode = 'from-start',
    status = 'idle',
    primaryDisabled = false,
}: { isExternalSession?: boolean; isAudition?: boolean; startMode?: VideoExportStartMode; status?: VideoExportStatus; primaryDisabled?: boolean } = {}) {
    const container = document.createElement('div'),
        sendCommand = vi.fn(),
        onStartModeChange = vi.fn(),
        onOpenPresetSelector = vi.fn();
    root = createRoot(container);
    act(() => root!.render(React.createElement(RemoteVideoExportPanel, {
        exportState: { ...idleVideoExportState(), status, countdown: status === 'countdown' ? 3 : null },
        selectedPreset: VIDEO_EXPORT_PRESETS[0],
        isExternalSession, isAudition, startMode, primaryDisabled,
        sendCommand, onStartModeChange, onOpenPresetSelector,
    })));
    const button = (key: string) => [...container.querySelectorAll('button')]
        .find(node => node.textContent === key);
    const click = (node: HTMLButtonElement | undefined) => {
        expect(node).toBeDefined();
        act(() => node!.click());
    };
    return { container, sendCommand, onStartModeChange, onOpenPresetSelector, button, click };
}

it.each(['from-start', 'next'] as const)('maps %s to waiting for the next room song without sending a skip command', mode => {
    const ui = mount({ startMode: mode }), next = ui.button('remote.exportNextSong')!;
    expect(next.disabled).toBe(false);
    expect(next.getAttribute('aria-pressed')).toBe('true');
    expect(next.title).toBe('remote.exportNextSongHint');
    expect(ui.button('remote.exportFullSong')).toBeUndefined();
    ui.click(next);
    expect(ui.onStartModeChange).toHaveBeenCalledExactlyOnceWith('next');
    ui.click(ui.button('remote.recordNextSong'));
    expect(ui.sendCommand).toHaveBeenCalledExactlyOnceWith({
        type: 'start-export', preset: VIDEO_EXPORT_PRESETS[0], startMode: 'next',
    });
});

it('keeps From Here selectable in a room', () => {
    const ui = mount({ startMode: 'current' }), current = ui.button('remote.exportFromHere')!;
    expect(current.disabled).toBe(false);
    expect(current.getAttribute('aria-pressed')).toBe('true');
    ui.click(current);
    expect(ui.onStartModeChange).toHaveBeenCalledExactlyOnceWith('current');
    ui.click(ui.button('remote.startRecording'));
    expect(ui.sendCommand).toHaveBeenCalledExactlyOnceWith({
        type: 'start-export', preset: VIDEO_EXPORT_PRESETS[0], startMode: 'current',
    });
});

it('requires ending an audition before waiting for the room and keeps From Here available', () => {
    const ui = mount({ startMode: 'next', isAudition: true }), next = ui.button('remote.exportNextSong')!;
    expect(next.disabled).toBe(true);
    expect(next.title).toBe('export.nextSongRequiresRoomPlayback');
    ui.click(next);
    expect(ui.onStartModeChange).not.toHaveBeenCalled();
    expect(ui.button('remote.exportFromHere')!.getAttribute('aria-pressed')).toBe('true');
    ui.click(ui.button('remote.startRecording'));
    expect(ui.sendCommand).toHaveBeenCalledExactlyOnceWith({
        type: 'start-export', preset: VIDEO_EXPORT_PRESETS[0], startMode: 'current',
    });
});

it.each(['from-start', 'next'] as const)('offers ordinary Full Song recording after leaving a room with %s selected', mode => {
    const ui = mount({ isExternalSession: false, startMode: mode });
    expect(ui.button('remote.exportNextSong')).toBeUndefined();
    ui.click(ui.button('remote.exportFullSong'));
    expect(ui.onStartModeChange).toHaveBeenCalledExactlyOnceWith('from-start');
    ui.click(ui.button('remote.startRecording'));
    expect(ui.sendCommand).toHaveBeenCalledExactlyOnceWith({
        type: 'start-export', preset: VIDEO_EXPORT_PRESETS[0], startMode: 'from-start',
    });
});

it('locks settings while waiting and cancels without requesting a stop-and-save or skip', () => {
    const ui = mount({ startMode: 'next', status: 'waiting' });
    expect(ui.container.querySelector('[role="status"]')?.textContent).toBe('remote.waitingNextSong');
    for (const key of ['remote.exportNextSong', 'remote.exportFromHere']) {
        expect(ui.button(key)!.disabled).toBe(true);
        ui.click(ui.button(key));
    }
    const preset = [...ui.container.querySelectorAll('button')].find(node => node.querySelector('svg.lucide-chevron-down'))!;
    expect(preset.disabled).toBe(true);
    ui.click(preset);
    expect(ui.onStartModeChange).not.toHaveBeenCalled();
    expect(ui.onOpenPresetSelector).not.toHaveBeenCalled();
    expect(ui.button('remote.stopAndSave')).toBeUndefined();
    expect(ui.button('remote.recordNextSong')).toBeUndefined();
    ui.click(ui.button('remote.cancel'));
    expect(ui.sendCommand).toHaveBeenCalledExactlyOnceWith({ type: 'cancel-export' });
});

it('offers stop-and-save once recording starts', () => {
    const ui = mount({ startMode: 'next', status: 'recording' });
    expect(ui.button('remote.stopAndSave')!.disabled).toBe(false);
    ui.click(ui.button('remote.stopAndSave'));
    expect(ui.sendCommand).toHaveBeenCalledExactlyOnceWith({ type: 'stop-export' });
});

it('hides the countdown for room playback even if an older snapshot still contains one', () => {
    const ui = mount({ status: 'countdown' });
    expect(ui.container.textContent).not.toContain('remote.recordingCountdown');
});

it('keeps the countdown for an ordinary full-song recording', () => {
    const ui = mount({ isExternalSession: false, status: 'countdown' });
    expect(ui.container.textContent).toContain('remote.recordingCountdown');
});

it('respects a disabled host while idle', () => {
    const ui = mount({ primaryDisabled: true });
    expect(ui.button('remote.recordNextSong')!.disabled).toBe(true);
    ui.click(ui.button('remote.recordNextSong'));
    expect(ui.sendCommand).not.toHaveBeenCalled();
});

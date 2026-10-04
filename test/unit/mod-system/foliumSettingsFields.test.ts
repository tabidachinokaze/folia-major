// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Theme } from '@/types';
import type { FoliumParam } from '@/mods/folium/contract';
import { FoliumSettingsCard } from '@/mods/folium/FoliumSettingsCard';
import { createFoliumParamAccess, flushFoliumParamsSave, importFoliumParams } from '@/mods/folium/paramStore';

// test/unit/mod-system/foliumSettingsFields.test.ts
// Exercise the native settings controls against the real schema store, including
// live external writes and resets; command/effect forms keep their compact UI.
const locale = vi.hoisted(() => ({ language: 'zh-CN' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: locale }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const theme: Theme = {
    name: 'test', backgroundColor: '#111111', primaryColor: '#eeeeee',
    secondaryColor: '#667788', accentColor: '#aabbcc', fontStyle: 'sans', animationIntensity: 'calm',
};
const group = { 'zh-CN': '聊天显示', en: 'Chat appearance' };
const schema: FoliumParam[] = [
    { key: 'on', type: 'boolean', label: { 'zh-CN': '开启弹幕', en: 'Enable danmaku' }, defaultValue: false },
    { key: 'position', type: 'select', label: { 'zh-CN': '聊天显示位置', en: 'Chat position' }, defaultValue: 'panel', options: [
        { value: 'panel', label: { 'zh-CN': '面板内', en: 'Panel' } },
        { value: 'bottom-left', label: { 'zh-CN': '左下角', en: 'Bottom left' } },
    ] },
    { key: 'duration', type: 'number', label: { 'zh-CN': '新消息显示时长（秒）', en: 'Preview duration (seconds)' },
        description: { 'zh-CN': '隐藏时仅临时显示新消息。', en: 'Only new messages appear briefly while chat is hidden.' },
        defaultValue: 5, min: 1, max: 30, step: 1, group },
    { key: 'text', type: 'text', label: { 'zh-CN': '文字', en: 'Text' }, defaultValue: '', group },
    { key: 'offset', type: 'number', label: { en: 'Offset' }, defaultValue: 150, group },
    { key: 'limit', type: 'number', label: { en: 'Limit' }, min: 0, defaultValue: 500, group },
];
let root: Root | null = null;
let container: HTMLDivElement;
beforeEach(() => {
    locale.language = 'zh-CN';
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    importFoliumParams({});
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    flushFoliumParamsSave();
    vi.unstubAllGlobals();
});

function mount(entryKind: 'settings-section' | 'visualizer-settings' = 'settings-section') {
    const access = createFoliumParamAccess('settings:sample:chat', schema);
    const render = (isDaylight = false) => act(() => root!.render(React.createElement(FoliumSettingsCard, {
        modId: 'sample', where: 'test', entryKind, entryId: 'sample:chat',
        title: { 'zh-CN': '聊天设置', en: 'Chat settings' }, fallbackTitle: 'Chat', access, theme, isDaylight,
    })));
    render();
    const named = <T extends HTMLElement>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`)!;
    const reset = () => act(() => [...container.querySelectorAll('button')].find(node => node.textContent === 'options.modVisualizerSettingsReset')!.click());
    return { access, render, named, reset };
}

it('uses native settings switches and dropdowns while persisting the schema values', () => {
    const ui = mount();
    const toggle = ui.named<HTMLButtonElement>('开启弹幕');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    act(() => toggle.click());
    expect(ui.access.get().on).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.style.backgroundColor).toBe('rgb(102, 119, 136)');
    expect(container.querySelector('select')).toBeNull();
    const dropdown = ui.named<HTMLButtonElement>('聊天显示位置');
    expect(dropdown.getAttribute('aria-haspopup')).toBe('listbox');
    act(() => dropdown.click());
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(node => node.textContent === '左下角')!;
    expect(option).toBeDefined();
    act(() => option.click());
    expect(ui.access.get().position).toBe('bottom-left');
    expect(dropdown.textContent).toBe('左下角');
    flushFoliumParamsSave();
    expect(JSON.parse(localStorage.getItem('folia_folium_params_v1')!)['settings:sample:chat']).toEqual({ on: true, position: 'bottom-left' });
});

it('preserves range units, bounds and step; edits and outside updates share reset behavior', () => {
    const ui = mount(), range = ui.named<HTMLInputElement>('新消息显示时长（秒）');
    expect([range.min, range.max, range.step, range.value]).toEqual(['1', '30', '1', '5']);
    expect(container.textContent).toContain('隐藏时仅临时显示新消息。');
    act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '12');
        range.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(ui.access.get().duration).toBe(12);
    act(() => ui.access.set({ duration: 99, text: 'draft', on: true }));
    expect(range.value).toBe('30');
    expect(ui.named<HTMLInputElement>('文字').value).toBe('draft');
    ui.reset();
    expect(range.value).toBe('5');
    expect(ui.named<HTMLInputElement>('文字').value).toBe('');
    expect(ui.named<HTMLButtonElement>('开启弹幕').getAttribute('aria-pressed')).toBe('false');
});

it('keeps values on language and daylight changes and translates group and option labels', () => {
    const ui = mount();
    act(() => ui.access.set({ position: 'bottom-left', duration: 9 }));
    locale.language = 'en';
    ui.render(true);
    expect([...container.querySelectorAll('h3')].map(node => node.textContent?.trim())).toEqual(['Chat settings', 'Chat appearance']);
    expect(ui.named<HTMLButtonElement>('Chat position').textContent).toBe('Bottom left');
    expect(ui.named<HTMLInputElement>('Preview duration (seconds)').value).toBe('9');
    expect(ui.named<HTMLButtonElement>('Enable danmaku').classList.contains('bg-zinc-300/90')).toBe(true);
    expect(ui.named<HTMLInputElement>('Preview duration (seconds)').classList.contains('text-zinc-900')).toBe(true);
});

it('uses numeric inputs without inventing missing bounds for other mod schemas', () => {
    const ui = mount(), offset = ui.named<HTMLInputElement>('Offset'), limit = ui.named<HTMLInputElement>('Limit');
    expect([offset.type, offset.min, offset.max, offset.value]).toEqual(['number', '', '', '150']);
    expect([limit.type, limit.min, limit.max, limit.value]).toEqual(['number', '0', '', '500']);
    act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(offset, '-25');
        offset.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(ui.access.get().offset).toBe(-25);
    act(() => ui.access.set({ offset: 150, limit: 1000 }));
    expect(offset.value).toBe('150');
    expect(limit.value).toBe('1000');
});

it('leaves effect settings on their existing compact controls', () => {
    const ui = mount('visualizer-settings');
    expect(container.querySelector('select')).not.toBeNull();
    expect(container.querySelector('[aria-pressed]')).toBeNull();
    expect(container.querySelector('[data-folium-kind="visualizer-settings"]')).not.toBeNull();
    act(() => ui.access.set({ duration: 13 }));
    expect(container.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('13');
});

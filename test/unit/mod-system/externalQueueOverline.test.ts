// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ExternalQueueOverline } from '@/components/shared/ExternalQueueActions';
import { createExternalQueueAdapter } from '@/mods/folium/externalQueueAdapter';
import { useExternalQueueStore } from '@/services/externalPlaybackQueue';

// test/unit/mod-system/externalQueueOverline.test.ts
const locale = vi.hoisted(() => ({ language: 'en' }));
vi.hoisted(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: () => null, setItem() {}, removeItem() {},
    } });
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: locale }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('renders safe localized text, updates live by occurrence and removes missing names', () => {
    const adapt = createExternalQueueAdapter(Symbol('room'));
    const queue = (name: string) => adapt({
        entries: [{ id: 'one', track: { id: 'song', source: 'netease', title: 'Song', artist: 'Artist' },
            actions: [], overline: { en: name, 'zh-CN': '听友昵称' } }], currentId: 'one', canNext: true,
    });
    const original = queue('<img src=x onerror=alert(1)>');
    useExternalQueueStore.setState({ view: original });
    const key = original.queue[0].externalQueueEntryKey!;
    const container = document.createElement('div'), root = createRoot(container);
    try {
        act(() => root.render(React.createElement(ExternalQueueOverline, { entryKey: key })));
        const label = container.querySelector('[data-session-overline]')!;
        expect(label.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(container.querySelector('img')).toBeNull();
        act(() => useExternalQueueStore.setState({ view: queue('Renamed') }));
        expect(container.firstChild).toBe(label);
        expect(label.textContent).toBe('Renamed');
        locale.language = 'zh-CN';
        act(() => root.render(React.createElement(ExternalQueueOverline, { entryKey: key })));
        expect(label.textContent).toBe('听友昵称');
        act(() => useExternalQueueStore.setState({ view: null }));
        expect(container.childNodes).toHaveLength(0);
    } finally {
        act(() => root.unmount());
        useExternalQueueStore.setState({ view: null });
        locale.language = 'en';
    }
});

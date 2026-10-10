import { expect, test, type Page } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../helpers/appState';

// test/ui/foliumQueueViews.spec.ts
// Real native surfaces consume public UI-only registrations; private audio state stays untouched.
test.use({ serviceWorkers: 'block' });
async function open(page: Page, demoMod = false) {
    await page.addInitScript(([version, guideKey]) => {
        localStorage.clear(); localStorage.setItem('i18nextLng', 'en');
        localStorage.setItem('open_player_on_launch', 'true'); localStorage.setItem('static_mode', 'true');
        localStorage.setItem('auto_use_best_lyric', 'false'); localStorage.setItem(guideKey, version);
        localStorage.setItem('library_suite_prompt_seen', 'true');
    }, [APP_VERSION, GUIDE_VERSION_STORAGE_KEY]);
    await page.route('**/__mock_netease__/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/'); await waitForAppMounted(page);
    await page.evaluate(async useSample => {
        const apiPath = '/src/mods/folium/api.ts', playbackPath = '/src/stores/usePlaybackStore.ts', appPath = '/src/stores/useAppViewStore.ts';
        const { createFoliumClientApi } = await import(apiPath), { usePlaybackStore } = await import(playbackPath),
            { setIsPanelOpen, setPanelTab } = await import(appPath);
        const privateSong = { id: 1001, name: 'Private queue song', artists: [{ id: 1, name: 'Private artist' }], album: { id: 1, name: 'Private album' }, durationMs: 180000 };
        usePlaybackStore.setState({ currentSong: privateSong, playQueue: [privateSong], duration: 180, audioSrc: null, playerState: 'PAUSED' });
        const api = createFoliumClientApi({ id: 'queue-test', name: 'Queue test', version: '1', author: null, description: null,
            permissions: [], enabled: true, status: 'loaded', error: null, trustStale: false, signature: { status: 'unsigned', reason: null, keyId: null, keyLabel: null, signedAt: null },
            devSource: false, experimental: [], embedOrigins: [], folia: null, hasMain: false, clientUrl: null }, { context: 'main', internals: null });
        const browser = window as any; browser.__queueApi = api; browser.__queueCalls = []; browser.__queueStops = [];
        if (useSample) {
            const samplePath = '/test/manual/folium-queue-view/client.mjs'; const { default: activate } = await import(samplePath);
            browser.__queueStops.push(activate(api));
        } else {
            const entry = (id: string, name: string) => ({ id, track: { id: 'same', source: 'netease', title: 'Repeated media', artist: 'Sample artist', album: 'Sample album', duration: 180 },
                overline: { en: name }, actions: [{ id: 'vote', icon: 'thumbs-up', label: { en: 'Vote' }, count: 0 }] });
            browser.__queueState = { entries: [entry('one', 'Alice'), entry('two', 'System recommendation')], currentId: 'one',
                actions: [{ id: 'sync', icon: 'refresh-cw', label: { en: 'Sync queue' } }] };
            browser.__queueHandle = api.registries.queueViews.register({ id: 'view', getSnapshot: () => browser.__queueState,
                subscribe: (listener: () => void) => { browser.__queueNotify = listener; return () => {}; },
                onAction: ({ entryId, actionId }: { entryId: string | null; actionId: string }) => {
                    browser.__queueCalls.push([entryId, actionId]);
                    if (actionId === 'vote') { browser.__queueState = { ...browser.__queueState, entries: browser.__queueState.entries.map((item: any) => item.id === entryId
                        ? { ...item, actions: [{ ...item.actions[0], count: item.actions[0].count + 1 }] } : item) }; browser.__queueNotify(); }
                },
            });
        }
        setPanelTab('queue'); setIsPanelOpen(true);
    }, demoMod);
}
async function palette(page: Page) {
    await page.evaluate(async () => { const path = '/src/stores/useAppViewStore.ts'; const { openCommandPaletteCommand } = await import(path); openCommandPaletteCommand('queue'); });
    await expect(page.getByTestId('command-palette-panel')).toBeVisible();
}

test('panel shows distinct occurrences, recommender and repeatable count actions while preserving private playback', async ({ page }) => {
    await open(page);
    const panel = page.getByTestId('unified-panel-surface');
    await expect(panel.getByText('Alice', { exact: true })).toBeVisible();
    await expect(panel.getByText('System recommendation', { exact: true })).toBeVisible();
    await expect(panel.locator('[role="listitem"][data-active="true"]')).toHaveCount(1);
    const row = panel.locator('[role="listitem"]').first(); await row.hover();
    for (let i = 0; i < 3; i++) await row.getByRole('button', { name: 'Vote', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Vote', exact: true })).toContainText('3');
    await row.getByText('Repeated media', { exact: true }).click();
    const privateState = await page.evaluate(async () => { const path = '/src/stores/usePlaybackStore.ts'; const { usePlaybackStore } = await import(path); const state = usePlaybackStore.getState(); return { name: state.currentSong.name, names: state.playQueue.map((item: any) => item.name), audio: state.audioSrc }; });
    expect(privateState).toEqual({ name: 'Private queue song', names: ['Private queue song'], audio: null });
    expect(await page.evaluate(() => (window as any).__queueCalls)).toEqual([['one', 'vote'], ['one', 'vote'], ['one', 'vote']]);
    await page.evaluate(() => (window as any).__queueHandle.unregister());
    await expect(panel.getByText('Private queue song', { exact: true })).toBeVisible();
    await expect(panel.getByText('Alice', { exact: true })).toHaveCount(0);
});

test('palette retains filtering help and puts sync before keep-open on one row; selection does not play private queue', async ({ page }) => {
    await open(page); await palette(page);
    const toolbar = page.getByTestId('command-palette-queue-toolbar');
    await expect(toolbar.locator('[data-toolbar-side="leading"]')).toContainText('Use @');
    const sync = toolbar.getByRole('button', { name: 'Sync queue', exact: true }), toggle = toolbar.getByRole('checkbox');
    const syncBox = (await sync.boundingBox())!, toggleBox = (await toggle.boundingBox())!;
    expect(Math.abs(syncBox.y + syncBox.height / 2 - toggleBox.y - toggleBox.height / 2)).toBeLessThan(4);
    expect(syncBox.x).toBeLessThan(toggleBox.x);
    await sync.click(); await expect.poll(() => page.evaluate(() => (window as any).__queueCalls)).toEqual([[null, 'sync']]);
    await sync.focus(); await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as any).__queueCalls)).toEqual([[null, 'sync'], [null, 'sync']]);
    await expect(page.getByTestId('command-palette-panel')).toBeVisible();
    await expect(page.getByTestId('command-palette-panel').getByText('Repeated media', { exact: true })).toHaveCount(2);
    await page.getByTestId('command-palette-panel').getByText('Repeated media', { exact: true }).first().click();
    expect(await page.evaluate(async () => { const path = '/src/stores/usePlaybackStore.ts'; const { usePlaybackStore } = await import(path); return usePlaybackStore.getState().currentSong.name; })).toBe('Private queue song');
});

test('occurrence toggles isolate checkbox, label and keyboard clicks from the row default action', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
        const browser = window as any;
        browser.__queueState.entries[0].actions.push({ id: 'choose', label: { en: 'Choose' } });
        browser.__queueState.entries[0].defaultAction = 'choose'; browser.__queueNotify();
        let checked = false;
        browser.__queueApi.ui.slots.register('queue.entry', (event: any) => {
            if (!event.context.entityId?.endsWith(':one')) return;
            event.slots.actions.unshift({ id: 'queue-test:toggle', kind: 'toggle', label: { en: 'Occurrence toggle' }, checked,
                setChecked: (value: boolean) => { checked = value; browser.__queueCalls.push(['one', 'toggle', value]); } });
        });
    });
    const row = page.getByTestId('unified-panel-surface').locator('[role="listitem"]').first(); await row.hover();
    const checkbox = row.getByRole('checkbox');
    await checkbox.click(); await expect(checkbox).toBeChecked();
    await row.getByText('Occurrence toggle', { exact: true }).click(); await expect(checkbox).not.toBeChecked();
    await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).toBeChecked();
    expect(await page.evaluate(() => (window as any).__queueCalls)).toEqual([['one', 'toggle', true], ['one', 'toggle', false], ['one', 'toggle', true]]);
    await row.click({ position: { x: 4, y: 20 } });
    expect(await page.evaluate(() => (window as any).__queueCalls)).toEqual([['one', 'toggle', true], ['one', 'toggle', false], ['one', 'toggle', true], ['one', 'choose']]);
});

test('native wall shows duplicate occurrence posters and exposes source actions in the expanded controls and tools', async ({ page }) => {
    await open(page);
    await page.getByTestId('unified-panel-surface').locator('[data-ui-slot-item="host:queue-wall"]').click();
    const wall = page.getByRole('region', { name: 'Queue collage' });
    await expect(wall).toBeVisible();
    const poster = wall.locator('.lattice-poster.is-expanded.is-current');
    await expect(poster).toHaveCount(1); await expect(poster.getByText('Alice', { exact: true })).toBeVisible(); await poster.hover();
    await expect(poster.getByRole('button', { name: 'Vote', exact: true })).toBeVisible();
    await poster.getByRole('button', { name: 'Vote', exact: true }).click();
    expect(await page.evaluate(() => (window as any).__queueCalls)).toEqual([['one', 'vote']]);
    await page.evaluate(() => { const browser = window as any; browser.__queueState.currentId = 'two'; browser.__queueNotify(); });
    await expect(poster).toHaveCount(1); await expect(poster.getByText('System recommendation', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lattice tools', exact: true }).click();
    const focus = page.getByRole('menuitem', { name: 'Focus current song', exact: true });
    await expect(focus).toBeEnabled(); await focus.click();
    await expect(poster.getByText('System recommendation', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Lattice tools', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Sync queue', exact: true })).toBeVisible();
    await page.evaluate(() => {
        const browser = window as any;
        browser.__queueApi.ui.slots.register('lattice.tools', (event: any) => {
            Object.assign(event.slots.actions.find((item: any) => item.id === 'host:queue-command'), { icon: 'thumbs-up', count: 7, pressed: true });
            Object.assign(event.slots.actions.find((item: any) => item.id === 'host:auto-focus'), { disabled: true, checked: false, icon: 'thumbs-down', count: 2 });
        });
    });
    const queueCommand = page.getByRole('menuitem', { name: /^Open queue command/ });
    await expect(queueCommand).toHaveAttribute('aria-pressed', 'true'); await expect(queueCommand).toContainText('7');
    await expect(queueCommand.locator('svg')).toHaveAttribute('class', /lucide-thumbs-up/);
    const following = page.getByRole('menuitemcheckbox', { name: /^Auto-focus on track change/ });
    await expect(following).toBeDisabled(); await expect(following).toHaveAttribute('aria-checked', 'false'); await expect(following).toContainText('2');
    await expect(following.locator('svg')).toHaveAttribute('class', /lucide-thumbs-down/);
    await page.getByRole('menuitem', { name: 'Sync queue', exact: true }).click();
    expect(await page.evaluate(() => (window as any).__queueCalls)).toEqual([['one', 'vote'], [null, 'sync']]);
});

test('wall action counts appear only on individual hover or keyboard focus without shifting controls', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
        const browser = window as any;
        browser.__queueState.entries[0].actions[0].count = 15; browser.__queueNotify();
    });
    const panel = page.getByTestId('unified-panel-surface');
    await expect(panel.getByRole('button', { name: 'Vote', exact: true }).first().getByText('15', { exact: true })).toBeVisible();
    await palette(page);
    await expect(page.getByTestId('command-palette-panel').getByRole('button', { name: 'Vote', exact: true }).first().getByText('15', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await panel.locator('[data-ui-slot-item="host:queue-wall"]').click();
    const poster = page.getByRole('region', { name: 'Queue collage' }).locator('.lattice-poster.is-expanded.is-current');
    await poster.hover();
    const vote = poster.getByRole('button', { name: 'Vote', exact: true });
    const count = vote.locator('.queue-slot-hover-count');
    await expect(vote).toBeVisible(); await expect(vote.locator('svg')).toBeVisible(); await expect(count).toBeHidden();
    await expect(vote).toHaveAccessibleDescription('15');
    const sizeBefore = await vote.evaluate(button => ({ width: button.clientWidth, height: button.clientHeight }));
    const iconOffset = () => vote.evaluate(button => {
        const buttonBox = button.getBoundingClientRect(), iconBox = button.querySelector('svg')!.getBoundingClientRect();
        return { x: iconBox.x - buttonBox.x, y: iconBox.y - buttonBox.y };
    });
    const beforeOffset = await iconOffset();
    await vote.hover(); await expect(count).toBeVisible();
    await vote.click(); await expect(count).toHaveText('16');
    expect(await vote.evaluate(button => ({ width: button.clientWidth, height: button.clientHeight }))).toEqual(sizeBefore);
    expect(await iconOffset()).toEqual(beforeOffset);
    await poster.hover(); await expect(count).toBeHidden();
    await vote.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(vote).toBeFocused(); await expect(count).toBeVisible();
    await page.keyboard.press('Space'); await expect(count).toHaveText('17');
    await expect(vote).toHaveAccessibleDescription('17');
    expect(await page.evaluate(() => (window as any).__queueCalls)).toEqual([['one', 'vote'], ['one', 'vote']]);
});

test('sample mod inserts, removes and reorders occurrences, edits all queue lists and restores native UI', async ({ page }) => {
    await open(page, true);
    await page.evaluate(async () => { const path = '/src/stores/useAppViewStore.ts'; const { setPanelTab } = await import(path); setPanelTab('folium:queue-test:queue-demo'); });
    const panel = page.getByTestId('unified-panel-surface');
    await panel.getByRole('button', { name: 'Insert occurrence / 增', exact: true }).click();
    await panel.getByRole('button', { name: 'Reverse / 重排', exact: true }).click();
    await panel.getByRole('button', { name: 'Edit lists / 改插槽', exact: true }).click();
    await expect(panel.locator('pre')).toContainText('toggle list edits');
    await palette(page);
    await expect(page.getByRole('button', { name: 'Inserted first', exact: true })).toBeVisible();
    await expect(page.getByText('Edited native help', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Inserted first', exact: true }).click();
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: 'Delete last / 删', exact: true }).click();
    await panel.getByRole('button', { name: 'Restore native / 恢复宿主', exact: true }).click();
    await expect(panel.locator('pre')).toContainText('restore native UI');
    await palette(page);
    await expect(page.getByText('Edited native help', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('command-palette-panel').getByText('Private queue song', { exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { installBaseState, mockNeteaseApi, openApp } from './helpers/appFixtures';

// test/ui/foliumHomeTabs.spec.ts
// Exercise the real App palette listener across host navigation and owned ShadowRoot input.

for (const suite of ['grid', 'bravais'] as const) {
    test(`${suite}: the global command palette remains reachable from an owned home page`, async ({ page }) => {
        await installBaseState(page, { neteaseMode: 'guest' });
        await mockNeteaseApi(page, 'guest');
        await openApp(page);
        await page.evaluate(async value => {
            const suitePath = '/src/library/core/state/useLibrarySuiteStore.ts';
            const registryPath = '/src/mods/folium/registries/homeTabs.ts';
            const { useLibrarySuiteStore } = await import(suitePath);
            const { homeTabsRegistry } = await import(registryPath);
            useLibrarySuiteStore.getState().setSuite(value);
            homeTabsRegistry.register('home-test', {
                id: 'messages', label: { en: 'Home Messages' },
                mount(container: HTMLElement) {
                    const input = document.createElement('textarea'); input.setAttribute('aria-label', 'Message draft');
                    container.append(input);
                },
            });
        }, suite);
        const entry = suite === 'grid' ? page.getByRole('button', { name: 'Home Messages', exact: true })
            : page.locator('[data-bravais-tab="home-test:messages"]');
        await entry.click();
        const homePage = page.locator('[data-folium-home-page="home-test:messages"]');
        const palette = page.getByTestId('command-palette-panel');
        await homePage.getByRole('button', { name: 'Back to library' }).press('ControlOrMeta+k');
        await expect(palette).toBeVisible();
        await palette.getByRole('combobox').press('Escape');
        await expect(palette).toHaveCount(0);
        const draft = homePage.getByRole('textbox', { name: 'Message draft' });
        await draft.fill('Hello');
        await draft.press('End');
        await draft.press('Enter');
        await page.keyboard.type('Second line');
        await draft.press('Control+Enter');
        await expect(draft).toHaveValue('Hello\nSecond line');
        await expect(palette).toHaveCount(0);
        await draft.press('ControlOrMeta+k');
        await expect(palette).toBeVisible();
        await expect(homePage).toBeVisible();
    });
}

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildServiceStubModule, LOCAL_MUSIC_SERVICE_ROUTE } from '../../dev/probes/homeBehavior/serviceStubModule';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/foliumHomeTabs.spec.ts
// Real Home adapters in both suites: owned page lifecycle, full-size layout, and ShadowRoot input isolation.

type HomeTabWindow = Window & {
    __homeTabTest: { mounts: number; cleanups: number; unregister: () => void };
};

async function registerPage(page: Page) {
    await page.evaluate(async () => {
        const registryPath = '/src/mods/folium/registries/homeTabs.ts';
        const { homeTabsRegistry } = await import(registryPath);
        const state = { mounts: 0, cleanups: 0, unregister: () => {} };
        (window as unknown as HomeTabWindow).__homeTabTest = state;
        state.unregister = homeTabsRegistry.register('home-test', {
            id: 'messages', label: { en: 'Home Messages', 'zh-CN': '首页私信' },
            mount(container: HTMLElement) {
                state.mounts++;
                const heading = document.createElement('h2'); heading.textContent = 'Owned message page';
                const input = document.createElement('textarea'); input.setAttribute('aria-label', 'Message draft');
                const button = document.createElement('button'); button.textContent = 'Draft action';
                container.style.display = 'grid'; container.style.gridTemplateColumns = '240px 1fr';
                container.append(heading, input, button);
                return () => { state.cleanups++; };
            },
        }).unregister;
    });
}

for (const suite of ['grid', 'bravais'] as const) {
    test(`${suite}: contributed navigation opens a full page, isolates input, and returns to native tabs`, async ({ mount, page }) => {
        await page.route(LOCAL_MUSIC_SERVICE_ROUTE, route => route.fulfill({ contentType: 'text/javascript', body: buildServiceStubModule() }));
        await mount('homeBehavior');
        await expect.poll(() => page.evaluate(() => window.__homeProbe?.ready() ?? false)).toBe(true);
        await page.evaluate(value => window.__homeProbe!.setSuite(value), suite);
        await registerPage(page);
        const nativeRoot = suite === 'grid' ? page.locator('[data-ponder-page-scope="grid-page"]') : page.locator('[data-bravais-seam]');
        const entry = suite === 'grid' ? nativeRoot.getByRole('button', { name: 'Home Messages', exact: true })
            : nativeRoot.locator('[data-bravais-tab="home-test:messages"]');
        await entry.click();
        const homePage = page.locator('[data-folium-home-page="home-test:messages"]');
        await expect(homePage.getByText('Owned message page')).toBeVisible();
        const host = homePage.locator('[data-folium-kind="home-tab"]');
        const box = (await host.boundingBox())!;
        expect(box.width).toBeGreaterThan(1000);
        expect(box.height).toBeGreaterThan(800);
        const nativeTab = await page.evaluate(() => window.__homeProbe!.tab());
        const draft = homePage.getByRole('textbox', { name: 'Message draft' });
        await draft.fill('Hello ');
        await draft.press('End');
        await page.keyboard.type('world');
        await draft.press('Enter');
        await page.keyboard.type('Second line');
        await expect(draft).toHaveValue('Hello world\nSecond line');
        await draft.press('Control+Enter');
        await draft.press('Tab');
        await expect(homePage.getByRole('button', { name: 'Draft action' })).toBeFocused();
        expect(await page.evaluate(() => window.__homeProbe!.tab())).toBe(nativeTab);
        await expect(homePage).toBeVisible();
        // Native navigation still wins when it reselects the same source tab.
        await page.evaluate(async key => {
            const factoryPath = '/src/components/command-palette/commandFactories.ts';
            const searchPath = '/src/stores/useSearchNavigationStore.ts';
            const { createHomeTabCommand } = await import(factoryPath);
            const { useSearchNavigationStore } = await import(searchPath);
            createHomeTabCommand(key, '', '', []).execute('', { navigation: {
                setHomeViewTab: useSearchNavigationStore.getState().setHomeViewTab, navigateToHome: () => {},
            } });
        }, nativeTab);
        await expect(homePage).toHaveCount(0);
        await entry.click();
        await expect(homePage.getByText('Owned message page')).toBeVisible();
        await homePage.getByRole('button', { name: 'Albums', exact: true }).click();
        await expect(homePage).toHaveCount(0);
        expect(await page.evaluate(() => window.__homeProbe!.tab())).toBe('albums');
        expect(await page.evaluate(() => {
            const state = (window as unknown as HomeTabWindow).__homeTabTest;
            return state.mounts === state.cleanups;
        })).toBe(true);
    });
}

test('Grid Tab and Shift+Tab reach contributed pages and then leave native cycling for page focus', async ({ mount, page }) => {
    await page.route(LOCAL_MUSIC_SERVICE_ROUTE, route => route.fulfill({ contentType: 'text/javascript', body: buildServiceStubModule() }));
    await mount('homeBehavior');
    await expect.poll(() => page.evaluate(() => window.__homeProbe?.ready() ?? false)).toBe(true);
    await registerPage(page);
    const nativeRoot = page.locator('[data-ponder-page-scope="grid-page"]');
    await nativeRoot.getByRole('button', { name: 'Playlists', exact: true }).click();
    const homePage = page.locator('[data-folium-home-page="home-test:messages"]');
    for (let step = 0; step < 8 && await homePage.count() === 0; step++) await page.keyboard.press('Tab');
    await expect(homePage.getByRole('button', { name: 'Home Messages', exact: true })).toBeFocused();
    const nativeTab = await page.evaluate(() => window.__homeProbe!.tab());
    await page.keyboard.press('Tab');
    await expect(homePage.getByRole('textbox', { name: 'Message draft' })).toBeFocused();
    expect(await page.evaluate(() => window.__homeProbe!.tab())).toBe(nativeTab);
    await homePage.getByRole('button', { name: 'Playlists', exact: true }).click();
    await expect(homePage).toHaveCount(0);
    await page.keyboard.press('Shift+Tab');
    await expect(homePage.getByRole('button', { name: 'Home Messages', exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.__homeProbe!.tab())).toBe('playlist');
});

test('an open page survives suite changes and disappears with owner teardown, including safe re-enabling', async ({ mount, page }) => {
    await page.route(LOCAL_MUSIC_SERVICE_ROUTE, route => route.fulfill({ contentType: 'text/javascript', body: buildServiceStubModule() }));
    await mount('homeBehavior');
    await expect.poll(() => page.evaluate(() => window.__homeProbe?.ready() ?? false)).toBe(true);
    await registerPage(page);
    await page.getByRole('button', { name: 'Home Messages', exact: true }).click();
    const homePage = page.locator('[data-folium-home-page]');
    await expect(homePage.getByText('Owned message page')).toBeVisible();
    const count = await page.evaluate(() => (window as unknown as HomeTabWindow).__homeTabTest.mounts);
    await page.evaluate(() => window.__homeProbe!.setSuite('bravais'));
    await expect(page.locator('[data-library-stage="bravais"]')).toBeAttached();
    await expect(homePage.getByText('Owned message page')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as HomeTabWindow).__homeTabTest.mounts)).toBe(count);
    await page.evaluate(() => (window as unknown as HomeTabWindow).__homeTabTest.unregister());
    await expect(homePage).toHaveCount(0);
    expect(await page.evaluate(() => window.__homeProbe!.tab())).toBe('playlist');
    expect(await page.evaluate(() => {
        const state = (window as unknown as HomeTabWindow).__homeTabTest; return state.mounts === state.cleanups;
    })).toBe(true);
    await expect(page.locator('[data-bravais-tab="home-test:messages"]')).toHaveCount(0);
    await registerPage(page);
    await page.locator('[data-bravais-tab="home-test:messages"]').click();
    await expect(homePage.getByText('Owned message page')).toBeVisible();
    await homePage.getByRole('button', { name: 'Back to library' }).click();
    await expect(homePage).toHaveCount(0);
    await expect(page.locator('[data-library-stage="bravais"]')).toHaveAttribute('data-bravais-active', 'true');
});

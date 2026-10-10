import { expect, test } from './fixtures';

// test/component/playerLayout.spec.ts
// Pointer hit testing needs a browser: geometry alone cannot prove controls remain reachable.

test.beforeEach(async ({ mount }) => { await mount('playerLayout'); });

test('full chat preserves the hidden back-button reveal region and native card clicks', async ({ page }) => {
    const chat = page.locator('[data-layout-demo-chat]');
    await expect(chat).toBeVisible();
    await expect.poll(async () => (await chat.boundingBox())!.y).toBe(76);
    await page.mouse.move(42, 42);
    const back = page.getByRole('button', { name: 'Back to home' });
    await expect(back).toHaveCSS('pointer-events', 'auto');
    await back.click();
    await expect(page.locator('[data-probe-layout]')).toHaveAttribute('data-back-hits', '1');
    await page.getByRole('button', { name: 'Activate native card' }).click();
    await expect(page.locator('[data-probe-layout]')).toHaveAttribute('data-card-hits', '1');
});

test('the private demo avoids a side panel and updates after viewport resizing', async ({ page }) => {
    const dialog = page.locator('[data-layout-demo-dialog]');
    await expect(dialog).toBeVisible();
    await page.locator('[data-probe-action="panel"]').click();
    await expect.poll(async () => {
        const a = (await dialog.boundingBox())!;
        const b = (await page.locator('[data-probe-panel]').boundingBox())!;
        return a.x + a.width <= b.x;
    }).toBe(true);
    await page.setViewportSize({ width: 800, height: 600 });
    await expect.poll(async () => {
        const box = (await dialog.boundingBox())!;
        return box.x >= 0 && box.y >= 0 && box.x + box.width <= 800 && box.y + box.height <= 600;
    }).toBe(true);
});

test('moving the bottom baseline raises the native card and the chat clearance together', async ({ page }) => {
    const chat = page.locator('[data-layout-demo-chat]');
    await expect(chat).toBeVisible();
    await expect.poll(async () => (await chat.boundingBox())!.height).toBeGreaterThan(100);
    const before = (await chat.boundingBox())!;
    await page.locator('[data-probe-action="lift"]').click();
    await expect.poll(async () => (await chat.boundingBox())!.height).toBeLessThan(before.height - 60);
    const after = (await chat.boundingBox())!;
    const card = (await page.getByRole('button', { name: 'Activate native card' }).boundingBox())!;
    expect(after.y + after.height).toBeLessThanOrEqual(card.y - 10);
});

test('publishes native status toasts and returns null immediately outside the player', async ({ page }) => {
    await page.locator('[data-probe-action="toast"]').click();
    await expect.poll(async () => {
        const text = await page.locator('[data-probe-demo]').getAttribute('data-layout-demo-snapshot');
        return text?.includes('status-toast');
    }).toBe(true);
    await page.locator('[data-probe-action="replace-toast"]').click();
    await page.waitForTimeout(400);
    await expect.poll(async () => (await page.locator('[data-probe-demo]').getAttribute('data-layout-demo-snapshot'))?.includes('status-toast')).toBe(true);
    await page.locator('[data-probe-action="page"]').click();
    await expect(page.locator('[data-layout-demo-chat]')).toBeHidden();
    await expect(page.locator('[data-probe-demo]')).toHaveAttribute('data-layout-demo-snapshot', 'null');
});

test('static visuals keep live app-overlay geometry and hidden control reveal regions', async ({ page }) => {
    await page.locator('[data-probe-action="static"]').click();
    const chat = page.locator('[data-layout-demo-chat]');
    await expect(chat).toBeVisible();
    await expect.poll(async () => {
        const text = await page.locator('[data-probe-demo]').getAttribute('data-layout-demo-snapshot');
        const ids = JSON.parse(text ?? 'null')?.obstacles.map((item: { id: string }) => item.id) ?? [];
        return ids.includes('back-reveal') && ids.includes('panel-reveal');
    }).toBe(true);
    await expect.poll(async () => (await chat.boundingBox())!.y).toBe(76);
    await page.mouse.move(42, 42);
    const back = page.getByRole('button', { name: 'Back to home' });
    await expect(back).toHaveCSS('pointer-events', 'auto');
    await back.click();
    await expect(page.locator('[data-probe-layout]')).toHaveAttribute('data-back-hits', '1');
});

test('a lower side panel leaves the non-overlapping upper-right dialog in place', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    const dialog = page.locator('[data-layout-demo-dialog]');
    await expect.poll(async () => (await dialog.boundingBox())?.x).toBe(876);
    const before = (await dialog.boundingBox())!;
    await page.locator('[data-probe-action="lower-panel"]').click();
    await expect(page.locator('[data-probe-panel]')).toBeVisible();
    await expect.poll(async () => (await page.locator('[data-probe-demo]').getAttribute('data-layout-demo-snapshot'))?.includes('player-panel')).toBe(true);
    const after = (await dialog.boundingBox())!;
    const panel = (await page.locator('[data-probe-panel]').boundingBox())!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.y + after.height + 12).toBeLessThanOrEqual(panel.y);
    await page.screenshot({ path: testInfo.outputPath('lower-panel-geometry.png') });
});

test('moving over chat inside the broad hover area still reveals the native button', async ({ page }) => {
    const chat = page.locator('[data-layout-demo-chat]');
    await expect(chat).toBeVisible();
    await expect.poll(async () => (await chat.boundingBox())?.y).toBe(76);
    const back = page.getByRole('button', { name: 'Back to home' });
    await page.mouse.move(400, 300);
    await expect(back).toHaveCSS('pointer-events', 'none');
    await page.mouse.move(42, 90);
    expect(await page.evaluate(() => Boolean(document.elementFromPoint(42, 90)?.closest('[data-layout-demo-chat]')))).toBe(true);
    await expect(back).toHaveCSS('pointer-events', 'auto');
    await page.mouse.move(-10, -10);
    await expect(back).toHaveCSS('pointer-events', 'none');
    await page.mouse.move(42, 90);
    await expect(back).toHaveCSS('pointer-events', 'auto');
    await back.click();
    await expect(page.locator('[data-probe-layout]')).toHaveAttribute('data-back-hits', '1');
    await page.locator('[data-probe-action="page"]').click();
    await page.mouse.move(400, 300);
    await page.mouse.move(42, 42);
    await expect(back).toHaveCSS('pointer-events', 'none');
});

test('the reserved return hitbox follows the actual native rem layout', async ({ page }) => {
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
    const chat = page.locator('[data-layout-demo-chat]');
    await expect.poll(async () => (await chat.boundingBox())?.y).toBe(92);
    const back = page.getByRole('button', { name: 'Back to home' });
    await page.mouse.move(42, 92);
    await expect(back).toHaveCSS('pointer-events', 'auto');
    await back.click();
    await expect(page.locator('[data-probe-layout]')).toHaveAttribute('data-back-hits', '1');
});

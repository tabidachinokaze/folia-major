import { expect, test } from './fixtures';

// test/component/remoteControls.spec.ts
test('remote lists reorder, counted reactions repeat, native heart and tools stay separate, unload restores defaults', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=remoteControls');
    const remote = page.getByTestId('remote-window'); await remote.hover();
    await expect(remote.getByTitle('Previous')).toBeVisible();
    await page.locator('[data-remote-demo="toggle"]').click(); await remote.hover();
    const buttons = remote.getByTestId('remote-transport-actions').locator('button');
    await expect(buttons).toHaveCount(3);
    expect(await buttons.evaluateAll(items => items.map(item => item.getAttribute('data-remote-action-id'))))
        .toEqual(['host:next', 'host:play-pause', 'host:previous']);
    const vote = remote.getByRole('button', { name: 'Room vote' });
    await vote.click(); await expect(vote).toHaveText('1');
    await vote.click(); await expect(vote).toHaveText('2');
    await remote.locator('[data-remote-action-id="host:like"]').click();
    await expect(remote.locator('[data-remote-action-id="host:like"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('remote-log')).toHaveText('vote:1, vote:2, toggle-like');
    await expect(remote.getByTitle('Transparent controls')).toBeVisible();
    await page.locator('[data-remote-demo="toggle"]').click(); await remote.hover();
    await expect(remote.getByTestId('remote-transport-actions')).toHaveCount(0);
    await expect(remote.getByTitle('Previous')).toBeVisible();
});

test('native availability remains disabled after list projection', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=remoteControls');
    await page.locator('[data-remote-demo="toggle"]').click();
    await page.locator('[data-remote-demo="disabled"]').click();
    await page.getByTestId('remote-window').hover();
    for (const id of ['host:next', 'host:play-pause', 'host:previous', 'host:like']) {
        await expect(page.locator(`[data-remote-action-id="${id}"]`)).toBeDisabled();
    }
});

test('moved navigation keeps hover preview and deletion clears an active preview', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=remoteControls');
    await page.locator('[data-remote-demo="toggle"]').click();
    await page.locator('[data-remote-demo="move"]').click();
    const previous = page.getByTestId('remote-actions-actions').locator('[data-remote-action-id="host:previous"]');
    await previous.hover();
    await expect(page.getByText('Previous preview', { exact: true })).toBeVisible();
    await previous.click();
    await expect(page.getByTestId('remote-log')).toHaveText('previous');
    // Simulate a contribution updating while the pointer stays over the old button.
    await page.locator('[data-remote-demo="remove"]').evaluate((button: HTMLButtonElement) => button.click());
    await expect(previous).toHaveCount(0);
    await expect(page.getByText('Previous preview', { exact: true })).toHaveCount(0);
});

test('fixed native remote size keeps transport and two song actions on one row, counts do not move buttons', async ({ page }) => {
    // Electron's default, minimum and maximum remote size are all 450 x 230.
    await page.setViewportSize({ width: 450, height: 230 });
    await page.goto('/dev-probe.html?probe=remoteControls&nativeLayout');
    await page.locator('[data-remote-demo="toggle"]').evaluate((button: HTMLButtonElement) => button.click());
    const remote = page.getByTestId('remote-window');
    await remote.hover();
    const actions = remote.locator('[data-remote-action-id]');
    await expect(actions).toHaveCount(6);
    const rowButtons = remote.getByTestId('remote-transport-actions').locator('xpath=..').locator('button');
    const readBounds = () => rowButtons.evaluateAll(buttons => buttons.map(button => {
        const { x, y, width, height } = button.getBoundingClientRect();
        return { id: button.getAttribute('data-remote-action-id') || button.getAttribute('title'), x, y, width, height };
    }));
    // Wait for the native panel's enter animation before comparing hover/focus geometry.
    let lastBounds = '', lastChanged = Date.now();
    await expect.poll(async () => {
        const bounds = JSON.stringify(await readBounds());
        if (bounds !== lastBounds) { lastBounds = bounds; lastChanged = Date.now(); }
        return Date.now() - lastChanged >= 200;
    }).toBe(true);
    const resting = await readBounds();
    expect(resting.map(button => button.id)).toEqual([
        'host:previous', 'host:play-pause', 'host:next', 'host:loop', 'remote-probe:vote', 'host:like',
        'Transparent controls', 'Video export',
    ]);
    const centerY = resting[0].y + resting[0].height / 2;
    for (const [index, button] of resting.entries()) {
        expect(Math.abs(button.y + button.height / 2 - centerY)).toBeLessThan(1);
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.x + button.width).toBeLessThanOrEqual(450);
        if (index) expect(button.x).toBeGreaterThanOrEqual(resting[index - 1].x + resting[index - 1].width);
    }
    const vote = remote.getByRole('button', { name: 'Room vote' });
    const count = vote.locator('[data-remote-action-count]');
    await expect(count).toHaveText('3');
    await expect(count).not.toBeVisible();
    await vote.hover();
    await expect(count).toBeVisible();
    expect(await readBounds()).toEqual(resting);
    await page.mouse.move(10, 10);
    await expect(count).not.toBeVisible();
    await vote.focus();
    await expect(count).toBeVisible();
    expect(await readBounds()).toEqual(resting);
    await vote.press('Enter');
    await expect(count).toHaveText('4');
    expect(await readBounds()).toEqual(resting);
    await expect(page.getByTestId('remote-log')).toHaveText('vote:4');
});

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

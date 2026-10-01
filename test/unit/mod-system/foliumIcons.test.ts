// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkipForward } from 'lucide-react';
import { buildIconElement, createFoliumIcon, hasFoliumIcon, loadFoliumIconComponent, normalizeFoliumIconPaths } from '@/mods/folium/icons';

// test/unit/mod-system/foliumIcons.test.ts
// folium.ui.icon (Folium 1.2): lucide icons for mods as plain, mod-owned SVG elements.

const shapesOf = (svg: Element) => Array.from(svg.children).map(child => [
    child.tagName.toLowerCase(),
    Object.fromEntries(Array.from(child.attributes).map(attribute => [attribute.name, attribute.value])),
]);

describe('folium.ui.icon', () => {
    it('bounds custom path data and snapshots mod-owned arrays', () => {
        const paths = ['M1 7.5v3'];
        const normalized = normalizeFoliumIconPaths(paths);
        paths[0] = 'M0 0';
        expect(normalized).toEqual(['M1 7.5v3']);
        expect(Object.isFrozen(normalized)).toBe(true);
        for (const value of [[], Array(1), ['M'], ['M0'], ['M0 0 L'], ['M0 0 A1 1 0 3 0 1 1'], ['http://example.com/icon.svg'], ['M' + '0'.repeat(2048)], Array(33).fill('M0 0'), ['M0 0', 42]])
            expect(normalizeFoliumIconPaths(value)).toBeUndefined();
    });
    it('loads a React component from the same icon chunks for host-rendered tabs', async () => {
        const Icon = await loadFoliumIconComponent('users');
        expect(Icon).not.toBeNull();
        expect(renderToStaticMarkup(createElement(Icon!, { size: 16 }))).toContain('lucide-users');
        await expect(loadFoliumIconComponent('not-an-icon')).resolves.toBeNull();
    });
    it('draws the same shapes as the host lucide component', async () => {
        const icon = await createFoliumIcon('skip-forward');
        expect(icon).not.toBeNull();
        const host = document.createElement('div');
        host.innerHTML = renderToStaticMarkup(createElement(SkipForward));
        expect(shapesOf(icon!)).toEqual(shapesOf(host.firstElementChild!));
        expect(icon!.getAttribute('class')).toBe('lucide lucide-skip-forward');
        expect(icon!.getAttribute('stroke')).toBe('currentColor');
    });

    it('applies size, stroke width and color', async () => {
        const icon = await createFoliumIcon('play', { size: 16, strokeWidth: 1.5, color: '#ff0000' });
        expect(icon!.getAttribute('width')).toBe('16');
        expect(icon!.getAttribute('height')).toBe('16');
        expect(icon!.getAttribute('stroke-width')).toBe('1.5');
        expect(icon!.getAttribute('stroke')).toBe('#ff0000');
        expect(icon!.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    it('returns null for unknown or malformed names', async () => {
        expect(hasFoliumIcon('play')).toBe(true);
        expect(hasFoliumIcon('not-an-icon')).toBe(false);
        expect(hasFoliumIcon('constructor')).toBe(false);
        await expect(createFoliumIcon('not-an-icon')).resolves.toBeNull();
        await expect(createFoliumIcon(42 as unknown as string)).resolves.toBeNull();
    });

    it('hands out a new element on every call', async () => {
        const first = await createFoliumIcon('play');
        const second = await createFoliumIcon('play');
        expect(first).not.toBe(second);
        first!.setAttribute('stroke', 'red');
        expect(second!.getAttribute('stroke')).toBe('currentColor');
    });

    it('ignores invalid sizes', () => {
        const icon = buildIconElement('dot', [['circle', { cx: '12', cy: '12', r: '1', key: 'a' }]], { size: -4, strokeWidth: Number.NaN });
        expect(icon.getAttribute('width')).toBe('24');
        expect(icon.getAttribute('stroke-width')).toBe('2');
        expect(icon.firstElementChild!.hasAttribute('key')).toBe(false);
    });
});

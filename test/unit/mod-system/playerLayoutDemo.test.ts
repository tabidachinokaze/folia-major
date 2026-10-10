import { describe, expect, it } from 'vitest';
import { computePlayerLayoutDemo } from '../../../dev/folium/player-layout-demo/client.mjs';

// test/unit/mod-system/playerLayoutDemo.test.ts
// Demo placement uses true 2D intersections, rather than reserving an obstacle's entire column.

const bounds = { left: 0, top: 0, width: 1200, height: 800 };
const topObstacles = [
    { id: 'titlebar', kind: 'reveal-area', rect: { left: 0, top: 0, width: 1200, height: 56 } },
    { id: 'back', kind: 'reveal-area', rect: { left: 24, top: 24, width: 40, height: 40 } },
];
describe('layout demo geometry', () => {
    it('does not move a top dialog away from a tall panel lower in the same column', () => {
        const panel = { left: 848, top: 272, width: 320, height: 488 };
        const layout = computePlayerLayoutDemo({ bounds, obstacles: [...topObstacles, { id: 'panel', rect: panel }] });
        expect(layout.dialog).toEqual({ left: 876, top: 68, width: 300, height: 96 });
        expect(layout.chat?.top).toBe(76);
    });
    it('moves away when the top dialog really overlaps the panel', () => {
        const panel = { left: 848, top: 96, width: 320, height: 640 };
        const layout = computePlayerLayoutDemo({ bounds, obstacles: [...topObstacles, { id: 'panel', rect: panel }] });
        expect(layout.dialog).toEqual({ left: 536, top: 68, width: 300, height: 96 });
    });
    it('keeps compact chat and dialog from overlapping each other', () => {
        const compactBounds = { ...bounds, width: 600 };
        const layout = computePlayerLayoutDemo({ bounds: compactBounds, obstacles: topObstacles });
        expect(layout.dialog).not.toBeNull();
        expect(layout.chat).not.toBeNull();
        expect(layout.chat!.top).toBeGreaterThanOrEqual(layout.dialog!.top + layout.dialog!.height + 12);
        expect(layout.chat!.top + layout.chat!.height).toBeLessThanOrEqual(776);
    });
});

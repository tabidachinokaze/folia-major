import type { FoliumLayoutRect, FoliumPlayerLayout, FoliumPlayerObstacle } from '../mods/folium/contract';

// src/utils/playerOverlayGeometry.ts
// Public layout snapshots contain CSS pixels, clipped to the player's viewport bounds.

export const clipPlayerLayoutRect = (rect: FoliumLayoutRect, bounds: FoliumLayoutRect): FoliumLayoutRect | null => {
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
    const left = Math.max(bounds.left, rect.left);
    const top = Math.max(bounds.top, rect.top);
    const right = Math.min(bounds.left + bounds.width, rect.left + rect.width);
    const bottom = Math.min(bounds.top + bounds.height, rect.top + rect.height);
    if (right <= left || bottom <= top) return null;
    return Object.freeze({ left, top, width: right - left, height: bottom - top });
};

export const freezePlayerLayout = (
    bounds: FoliumLayoutRect,
    obstacles: readonly FoliumPlayerObstacle[],
): FoliumPlayerLayout => {
    const byId = new Map<string, FoliumPlayerObstacle>();
    for (const obstacle of obstacles) {
        const rect = clipPlayerLayoutRect(obstacle.rect, bounds);
        if (!rect) continue;
        const previous = byId.get(obstacle.id);
        // Keyed controls may coexist while an old instance exits. Reserve both until it unmounts.
        const merged = previous ? {
            left: Math.min(previous.rect.left, rect.left), top: Math.min(previous.rect.top, rect.top),
            width: Math.max(previous.rect.left + previous.rect.width, rect.left + rect.width) - Math.min(previous.rect.left, rect.left),
            height: Math.max(previous.rect.top + previous.rect.height, rect.top + rect.height) - Math.min(previous.rect.top, rect.top),
        } : rect;
        byId.set(obstacle.id, Object.freeze({ ...obstacle, rect: Object.freeze(merged) }));
    }
    return Object.freeze({
        bounds: Object.freeze({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }),
        obstacles: Object.freeze([...byId.values()].sort((left, right) => left.id.localeCompare(right.id))),
    });
};

export const samePlayerLayout = (left: FoliumPlayerLayout | null, right: FoliumPlayerLayout | null): boolean => {
    if (left === right) return true;
    if (!left || !right || left.obstacles.length !== right.obstacles.length) return false;
    const sameRect = (a: FoliumLayoutRect, b: FoliumLayoutRect) => (
        a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
    );
    return sameRect(left.bounds, right.bounds) && left.obstacles.every((item, index) => {
        const other = right.obstacles[index];
        return item.id === other.id && item.kind === other.kind && sameRect(item.rect, other.rect);
    });
};

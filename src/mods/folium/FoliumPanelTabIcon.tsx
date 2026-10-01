import React, { useEffect, useState } from 'react';
import { Puzzle, type LucideIcon } from 'lucide-react';
import { loadFoliumIconComponent, normalizeFoliumIconPaths } from './icons';

// src/mods/folium/FoliumPanelTabIcon.tsx
/** A mod-selected Lucide icon; unavailable icons retain the ordinary mod marker. */
export function FoliumPanelTabIcon({ name, paths, size = 16 }: { name?: string; paths?: readonly string[]; size?: number }) {
    const custom = React.useMemo(() => normalizeFoliumIconPaths(paths), [paths]);
    const [loaded, setLoaded] = useState<{ name: string; icon: LucideIcon } | null>(null);
    useEffect(() => {
        if (!name || custom) return;
        let disposed = false;
        void loadFoliumIconComponent(name).then(icon => {
            if (!disposed && icon) setLoaded({ name, icon });
        }).catch(() => { /* An optional icon must never break the panel. */ });
        return () => { disposed = true; };
    }, [name, custom]);
    if (custom) return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" data-folium-custom-icon="true">
        {custom.map((d, index) => <path key={index} d={d} />)}
    </svg>;
    const Icon = loaded && loaded.name === name ? loaded.icon : Puzzle;
    return <Icon size={size} aria-hidden="true" />;
}

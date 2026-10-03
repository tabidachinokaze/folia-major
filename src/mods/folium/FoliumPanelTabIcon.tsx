import React, { useEffect, useState } from 'react';
import { createLucideIcon, Puzzle, type LucideIcon, type LucideProps } from 'lucide-react';
import { loadFoliumIconComponent, normalizeFoliumIconPaths } from './icons';

// src/mods/folium/FoliumPanelTabIcon.tsx
/** A mod-selected line icon shared by panel tabs and command entry points. */
export const FoliumPanelTabIcon = React.forwardRef<SVGSVGElement, LucideProps & { name?: string; paths?: readonly string[] }>(function FoliumPanelTabIcon({ name, paths, size = 16, ...props }, ref) {
    const custom = React.useMemo(() => {
        const normalized = normalizeFoliumIconPaths(paths);
        return normalized ? createLucideIcon('FoliumCustomIcon', normalized.map((d, index) => ['path', { d, key: String(index) }])) : null;
    }, [paths]);
    const [loaded, setLoaded] = useState<{ name: string; icon: LucideIcon } | null>(null);
    useEffect(() => {
        if (!name || custom) return;
        let disposed = false;
        void loadFoliumIconComponent(name).then(icon => {
            if (!disposed && icon) setLoaded({ name, icon });
        }).catch(() => { /* An optional icon must never break the panel. */ });
        return () => { disposed = true; };
    }, [name, custom]);
    const Icon = custom ?? (loaded && loaded.name === name ? loaded.icon : Puzzle);
    return <Icon {...props} ref={ref} size={size} aria-hidden="true" data-folium-custom-icon={custom ? 'true' : undefined} />;
});

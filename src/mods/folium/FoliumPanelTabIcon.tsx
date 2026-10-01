import React, { useEffect, useState } from 'react';
import { Puzzle, type LucideIcon } from 'lucide-react';
import { loadFoliumIconComponent } from './icons';

// src/mods/folium/FoliumPanelTabIcon.tsx
/** A mod-selected Lucide icon; unavailable icons retain the ordinary mod marker. */
export function FoliumPanelTabIcon({ name, size = 16 }: { name?: string; size?: number }) {
    const [loaded, setLoaded] = useState<{ name: string; icon: LucideIcon } | null>(null);
    useEffect(() => {
        if (!name) return;
        let disposed = false;
        void loadFoliumIconComponent(name).then(icon => {
            if (!disposed && icon) setLoaded({ name, icon });
        }).catch(() => { /* An optional icon must never break the panel. */ });
        return () => { disposed = true; };
    }, [name]);
    const Icon = loaded && loaded.name === name ? loaded.icon : Puzzle;
    return <Icon size={size} aria-hidden="true" />;
}

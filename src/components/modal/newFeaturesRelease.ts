import { Command, Monitor, Square } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// src/components/modal/newFeaturesRelease.ts

type NewFeatureCard = {
    id: string;
    icon: LucideIcon;
    daylightIconClassName: string;
    darkIconClassName: string;
};

type NewFeaturesRelease = {
    i18nKey: string;
    features: NewFeatureCard[];
};

// Defines the current release's cards; their localized text lives under i18nKey in every locale.
export const NEW_FEATURES_RELEASE: NewFeaturesRelease = {
    i18nKey: 'releaseNotes.v0_7_19',
    features: [
        { id: 'stopAudition', icon: Square, daylightIconClassName: 'text-blue-600', darkIconClassName: 'text-blue-400' },
        { id: 'unifiedControls', icon: Monitor, daylightIconClassName: 'text-violet-600', darkIconClassName: 'text-violet-400' },
        { id: 'commandIcons', icon: Command, daylightIconClassName: 'text-emerald-600', darkIconClassName: 'text-emerald-400' },
    ],
};

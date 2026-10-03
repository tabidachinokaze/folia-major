import { Disc3, Headphones, LogOut, ThumbsUp } from 'lucide-react';
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
    i18nKey: 'releaseNotes.v0_7_18',
    features: [
        { id: 'roomAudition', icon: Headphones, daylightIconClassName: 'text-blue-600', darkIconClassName: 'text-blue-400' },
        { id: 'messageAlbums', icon: Disc3, daylightIconClassName: 'text-violet-600', darkIconClassName: 'text-violet-400' },
        { id: 'roomRemote', icon: ThumbsUp, daylightIconClassName: 'text-amber-600', darkIconClassName: 'text-amber-400' },
        { id: 'roomLeave', icon: LogOut, daylightIconClassName: 'text-emerald-600', darkIconClassName: 'text-emerald-400' },
    ],
};

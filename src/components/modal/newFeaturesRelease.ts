import { PanelsTopLeft, ThumbsUp, MessageCircle, SkipForward } from 'lucide-react';
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
    i18nKey: 'releaseNotes.v0_7_11',
    features: [
        { id: 'nativeQueue', icon: PanelsTopLeft, daylightIconClassName: 'text-emerald-600', darkIconClassName: 'text-emerald-400' },
        { id: 'roomActions', icon: ThumbsUp, daylightIconClassName: 'text-cyan-600', darkIconClassName: 'text-cyan-400' },
        { id: 'homeMessages', icon: MessageCircle, daylightIconClassName: 'text-violet-600', darkIconClassName: 'text-violet-400' },
        { id: 'roomNext', icon: SkipForward, daylightIconClassName: 'text-amber-600', darkIconClassName: 'text-amber-400' },
    ],
};

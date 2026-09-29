import { PanelsTopLeft, MessageCircle, Smile } from 'lucide-react';
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
    i18nKey: 'releaseNotes.v0_7_12',
    features: [
        { id: 'privateLayout', icon: PanelsTopLeft, daylightIconClassName: 'text-emerald-600', darkIconClassName: 'text-emerald-400' },
        { id: 'messageHistory', icon: MessageCircle, daylightIconClassName: 'text-cyan-600', darkIconClassName: 'text-cyan-400' },
        { id: 'privateTools', icon: Smile, daylightIconClassName: 'text-violet-600', darkIconClassName: 'text-violet-400' },
    ],
};

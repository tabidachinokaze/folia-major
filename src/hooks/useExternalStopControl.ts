import { useTranslation } from 'react-i18next';
import { useExternalQueueStore, stopExternalPlayback } from '../services/externalPlaybackQueue';
import { resolveFoliumLabel } from '../mods/folium/params';

// src/hooks/useExternalStopControl.ts
// Only this discrete transport capability is observed; queue counts and playback time do not rerender controls.
export function useExternalStopControl() {
    const { i18n } = useTranslation();
    const action = useExternalQueueStore(state => state.view?.stopAction);
    return action ? {
        label: resolveFoliumLabel(action.label, i18n.language, action.id),
        disabled: action.disabled === true,
        stop: stopExternalPlayback,
    } : null;
}

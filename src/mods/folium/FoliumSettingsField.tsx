import React from 'react';
import type { Theme } from '@/types';
import SettingsRow, { SettingsToggle } from '@/components/modal/settings/SettingsRow';
import { settingsDividerClassFor, settingsToggleOffClassFor } from '@/components/modal/settings/settingsCardClasses';
import { CustomSelect } from '@/components/shared/CustomSelect';
import type { FoliumParam } from './contract';
import { formatFoliumParamNumber, resolveFoliumLabel, resolveFoliumParamStep } from './params';

// src/mods/folium/FoliumSettingsField.tsx
// Schema-backed settings use the same rows and controls as the native settings
// pages. Values and validation still belong to the shared Folium param store.
export interface FoliumSettingsLayout {
    theme: Theme;
    isDaylight: boolean;
    rangeInputClass?: string;
}

interface FoliumSettingsFieldProps extends FoliumSettingsLayout {
    param: FoliumParam;
    value: unknown;
    language: string;
    disabled: boolean;
    isLast: boolean;
    onChange: (param: FoliumParam, value: unknown) => void;
}

export const FoliumSettingsField: React.FC<FoliumSettingsFieldProps> = ({
    param, value, language, disabled, isLast, theme, isDaylight, rangeInputClass, onChange,
}) => {
    const label = resolveFoliumLabel(param.label, language, param.key);
    const description = param.description ? resolveFoliumLabel(param.description, language, '') : undefined;
    const numericValue = typeof value === 'number' ? value : Number(param.defaultValue ?? param.min ?? 0);
    const isRange = param.type === 'number' && Number.isFinite(param.min) && Number.isFinite(param.max);
    return (
        <SettingsRow
            title={label}
            description={description}
            dividerClass={settingsDividerClassFor(isDaylight)}
            isLast={isLast}
            control={param.type === 'boolean' ? (
                <SettingsToggle
                    checked={Boolean(value)}
                    onChange={() => onChange(param, !value)}
                    offClass={settingsToggleOffClassFor(isDaylight)}
                    onColor={theme.secondaryColor}
                    disabled={disabled}
                    ariaLabel={label}
                />
            ) : isRange ? (
                <span className="text-xs font-mono tabular-nums opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {Number.isFinite(numericValue) ? formatFoliumParamNumber(numericValue) : '—'}
                </span>
            ) : undefined}
        >
            {isRange ? (
                <input
                    type="range"
                    aria-label={label}
                    className={rangeInputClass ?? `w-full accent-current disabled:opacity-40 ${isDaylight ? 'text-zinc-900' : 'text-white'}`}
                    value={Number.isFinite(numericValue) ? numericValue : (param.min ?? 0)}
                    min={param.min ?? 0}
                    max={param.max ?? 100}
                    step={resolveFoliumParamStep(param)}
                    disabled={disabled}
                    onChange={(event) => onChange(param, event.target.valueAsNumber)}
                />
            ) : null}
            {param.type === 'text' || (param.type === 'number' && !isRange) ? (
                <input
                    type={param.type}
                    aria-label={label}
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none min-w-0 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--overlay-medium)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    value={param.type === 'number' ? (Number.isFinite(numericValue) ? numericValue : '') : (typeof value === 'string' ? value : '')}
                    min={param.type === 'number' ? param.min : undefined}
                    max={param.type === 'number' ? param.max : undefined}
                    step={param.type === 'number' ? resolveFoliumParamStep(param) : undefined}
                    placeholder={param.placeholder}
                    disabled={disabled}
                    onChange={(event) => onChange(param, param.type === 'number' ? event.target.valueAsNumber : event.target.value)}
                />
            ) : null}
            {param.type === 'select' ? (
                <CustomSelect
                    value={typeof value === 'string' ? value : String(param.defaultValue ?? '')}
                    options={(param.options ?? []).map((option) => ({
                        value: option.value,
                        label: resolveFoliumLabel(option.label, language, option.value),
                    }))}
                    onChange={(nextValue) => onChange(param, nextValue)}
                    ariaLabel={label}
                    disabled={disabled}
                    isDaylight={isDaylight}
                    theme={theme}
                />
            ) : null}
        </SettingsRow>
    );
};

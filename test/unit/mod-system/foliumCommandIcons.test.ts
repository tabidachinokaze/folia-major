// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Heart, Puzzle, Users, type LucideIcon } from 'lucide-react';
import type { Theme } from '@/types';
import type { FoliumCommandDef } from '@/mods/folium/contract';
import { commandsRegistry } from '@/mods/folium/registries/commands';
import { COMMAND_PALETTE_COMMANDS } from '@/components/command-palette/commandRegistry';
import { installFoliumCommandPaletteSync } from '@/mods/folium/commandPaletteSync';
import PinnedCommandRow from '@/components/command-palette/PinnedCommandRow';
import CommandPaletteAllCommandsRow from '@/components/command-palette/CommandPaletteAllCommandsRow';

// test/unit/mod-system/foliumCommandIcons.test.ts
// Registry descriptors must reach every command entry point through the shared
// icon component, including pinned slots restored by command id.
const load = vi.hoisted(() => vi.fn());
vi.mock('@/mods/folium/icons', async (original) => ({ ...await original<typeof import('@/mods/folium/icons')>(), loadFoliumIconComponent: load }));
vi.mock('@/components/command-palette/commandRegistry', () => ({ COMMAND_PALETTE_COMMANDS: [] }));
vi.mock('@/i18n/config', () => ({ default: { language: 'en' } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const theme = { accentColor: '#79c7aa' } as Theme;
const register = (fields: Partial<FoliumCommandDef> = {}) => {
    installFoliumCommandPaletteSync();
    const handle = commandsRegistry.register('test-command-icons', {
        id: 'open', label: { en: 'Open workspace' }, run: () => {}, ...fields,
    });
    const command = COMMAND_PALETTE_COMMANDS.find(entry => entry.id === `folium:${handle.id}`)!;
    return { handle, command };
};
const render = async (element: React.ReactNode) => {
    if (!root) {
        const container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    }
    await act(async () => { root!.render(element); });
};
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    commandsRegistry.unregisterAll('test-command-icons');
    load.mockReset();
    document.body.replaceChildren();
});

describe('Folium command icons', () => {
    it('renders custom paths in command results and pinned shortcuts with host sizing and color', async () => {
        const paths = ['M2 8v8', 'M22 8v8'];
        const { command } = register({ icon: 'users', iconPaths: paths });
        // Mutating a plugin-owned array cannot replace a registered descriptor.
        paths[0] = '<path onload="alert(1)" />';
        await render(React.createElement(React.Fragment, null,
            React.createElement(CommandPaletteAllCommandsRow, {
                index: 0, style: {}, ariaAttributes: { 'aria-posinset': 1, 'aria-setsize': 1, role: 'listitem' },
                commands: [command], groupLabelKey: {}, isDaylight: false, itemIdleBg: '', theme,
                t: key => key, onPick: () => {},
            }),
            React.createElement(PinnedCommandRow, {
                commands: [command, null, null], isDaylight: false, isExecuting: false, theme, onExecute: () => {},
            }),
        ));
        const icons = [...document.querySelectorAll<SVGSVGElement>('[data-folium-custom-icon]')];
        expect(icons).toHaveLength(2);
        expect(icons.map(icon => icon.getAttribute('width'))).toEqual(['16', '15']);
        for (const icon of icons) {
            expect([...icon.querySelectorAll('path')].map(path => path.getAttribute('d'))).toEqual(['M2 8v8', 'M22 8v8']);
            expect(icon.getAttribute('stroke')).toBe('currentColor');
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
        expect(icons[1].classList.contains('shrink-0')).toBe(true);
        expect(icons[1].style.color).toBe('rgb(121, 199, 170)');
        expect(document.querySelector('[onload]')).toBeNull();
        expect(load).not.toHaveBeenCalled();
    });

    it('preserves the default icon and safely falls back from invalid paths to a named icon', async () => {
        const plain = register();
        expect(plain.command.icon).toBe(Puzzle);
        plain.handle.unregister();
        load.mockResolvedValue(Users);
        const { command } = register({ icon: 'users', iconPaths: ['<svg onload="alert(1)">'] });
        const ref = React.createRef<SVGSVGElement>();
        await render(React.createElement(command.icon!, { size: 19, ref }));
        expect(ref.current).toBe(document.querySelector('svg.lucide-users'));
        expect(ref.current?.getAttribute('width')).toBe('19');
        expect(document.querySelector('[onload]')).toBeNull();
    });

    it('keeps the replacement command icon when an old named icon loads after unregister', async () => {
        let resolve!: (icon: LucideIcon) => void;
        load.mockReturnValueOnce(new Promise<LucideIcon>(done => { resolve = done; })).mockResolvedValueOnce(Heart);
        const old = register({ icon: 'users' });
        await render(React.createElement(old.command.icon!));
        old.handle.unregister();
        const current = register({ icon: 'heart' });
        await render(React.createElement(current.command.icon!));
        await act(async () => { resolve(Users); });
        expect(document.querySelector('svg.lucide-heart')).not.toBeNull();
        expect(document.querySelector('svg.lucide-users')).toBeNull();
        expect(COMMAND_PALETTE_COMMANDS.filter(entry => entry.id === current.command.id)).toEqual([current.command]);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFoliumUiSlots, invokeUiSlotItem, resolveUiSlots, subscribeUiSlots, uiSlotsRegistry } from '@/mods/folium/uiSlots';
import type { FoliumUiSlotItem } from '@/mods/folium/contract';

// test/unit/mod-system/foliumQueueSlots.test.ts
// Contributions are independently reversible; stale callbacks never outlive their registration or row.
const context = { surface: 'panel', entityId: 'occurrence' };
const item = (id: string, run = vi.fn()): FoliumUiSlotItem => ({ id, kind: 'button', icon: 'bookmark', label: { en: id }, run });
const defaults = () => ({ leading: [{ id: 'host:title', kind: 'text' as const, label: { en: 'Queue' } }], trailing: [item('host:first')] });
afterEach(() => uiSlotsRegistry.list().forEach(entry => uiSlotsRegistry.unregister(entry.id)));

describe('queue list editors', () => {
    it('announces registration and removal only after readers can see the new list', () => {
        const seen: string[][] = [];
        const stopReading = subscribeUiSlots('queue.header', () => seen.push(resolveUiSlots('queue.header', defaults(), context).trailing.map(item => item.id)));
        const stop = createFoliumUiSlots('a', 'main').register('queue.header', event => { event.slots.trailing.unshift(item('a:live')); });
        stop(); stopReading();
        expect(seen).toEqual([['a:live', 'host:first'], ['host:first']]);
    });

    it('supports ordered insertion, movement, removal and rewriting, restoring immutable defaults', () => {
        const source = defaults(), a = createFoliumUiSlots('a', 'main'), b = createFoliumUiSlots('b', 'main');
        const stop = a.register('queue.header', event => {
            event.slots.leading[0].label.en = 'Changed';
            event.slots.leading.push(...event.slots.trailing.splice(0));
            event.slots.trailing.unshift(item('a:sync'));
        });
        const stopB = b.register('queue.header', event => event.slots.trailing.unshift(item('b:earlier')));
        expect(resolveUiSlots('queue.header', source, context).trailing.map(value => value.id)).toEqual(['b:earlier', 'a:sync']);
        expect(source.leading[0].label.en).toBe('Queue');
        stopB(); stop();
        const restored = resolveUiSlots('queue.header', source, context);
        expect(restored.leading).toEqual(source.leading);
        expect(restored.trailing.map(value => value.id)).toEqual(['host:first']);
        expect(restored.trailing[0].label).toEqual(source.trailing[0].label);
    });

    it('rolls back only a bad contributor and ignores asynchronous or retained mutation', async () => {
        const a = createFoliumUiSlots('a', 'main'); let retained: Record<string, FoliumUiSlotItem[]>;
        a.register('queue.header', event => { retained = event.slots; event.slots.trailing.push(item('a:valid')); });
        a.register('queue.header', event => { event.slots.leading[0].label.en = 'Bad'; event.slots.trailing.push(item('other:invalid')); });
        a.register('queue.header', async event => { await Promise.resolve(); event.slots.trailing.length = 0; });
        const result = resolveUiSlots('queue.header', defaults(), context);
        retained!.leading[0].label.en = 'Late'; await Promise.resolve();
        expect(result.leading[0].label.en).toBe('Queue');
        expect(result.trailing.map(value => value.id)).toEqual(['host:first', 'a:valid']);
    });

    it('rejects stale registrations, removed actions and changes of occurrence', async () => {
        const a = createFoliumUiSlots('a', 'main'), run = vi.fn(); let visible = true;
        const register = () => a.register('queue.header', event => { if (visible) event.slots.trailing.push(item('a:run', run)); });
        const stop = register(), old = resolveUiSlots('queue.header', defaults(), context).trailing[1];
        visible = false; expect(await invokeUiSlotItem(old)).toBe(false);
        visible = true; stop(); register(); expect(await invokeUiSlotItem(old)).toBe(false);
        let mounted = true;
        const fresh = resolveUiSlots('queue.header', defaults(), context, () => mounted ? { target: 'queue.header', defaults: defaults(), context } : undefined).trailing[1];
        mounted = false; expect(await invokeUiSlotItem(fresh)).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('cannot enable a disabled native callback by rewriting metadata', async () => {
        const source = defaults(), run = vi.fn(); source.trailing[0] = { ...item('host:first', run), disabled: true };
        createFoliumUiSlots('a', 'main').register('queue.header', event => { event.slots.trailing[0].disabled = false; });
        expect(await invokeUiSlotItem(resolveUiSlots('queue.header', source, context).trailing[0])).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    it('validates toggle payloads and catches rejected action callbacks', async () => {
        const setChecked = vi.fn(), reject = vi.fn().mockRejectedValue(Error('expected'));
        const result = resolveUiSlots('command.toolbar', { leading: [], trailing: [
            { id: 'host:toggle', kind: 'toggle', label: { en: 'Toggle' }, checked: false, setChecked }, item('host:reject', reject),
        ] }, context);
        expect(await invokeUiSlotItem(result.trailing[0], 'invalid')).toBe(false);
        expect(await invokeUiSlotItem(result.trailing[0], true)).toBe(true);
        expect(setChecked).toHaveBeenCalledExactlyOnceWith(true);
        expect(await invokeUiSlotItem(result.trailing[1])).toBe(false);
    });

    it('restricts overline to text and makes export registration inert', () => {
        const a = createFoliumUiSlots('a', 'main');
        a.register('queue.entry', event => event.slots.overline.push(item('a:invalid')));
        expect(resolveUiSlots('queue.entry', { overline: [], actions: [] }, context).overline).toEqual([]);
        createFoliumUiSlots('export-test', 'export').register('queue.header', event => event.slots.trailing.push(item('export-test:ignored')));
        expect(uiSlotsRegistry.list().map(entry => entry.modId)).toEqual(['a']);
        expect(() => a.register('recording.actions', () => {})).toThrow('invalid-ui-slot-registration');
    });
});

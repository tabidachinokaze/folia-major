import React from 'react';
import { motion } from 'framer-motion';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { useTranslation } from 'react-i18next';
import { SongResult } from '../../types';
import TextInputDialog from '../shared/TextInputDialog';
import { getSongUnavailableLabel, isSongUnavailable } from '../../services/onlineMusic/songAvailability';
import { getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { getQueueSongKey } from '../../utils/appPlaybackGuards';

import { useQueueView, activateQueueViewSong } from '@/mods/folium/registries/queueViews';
import { useUiSlots } from '@/hooks/useUiSlots';
import { QueueSlotItems } from '../shared/QueueSlotItems';
import { useQueueEntrySlots, queueViewHeaderActions } from '../shared/useQueueEntrySlots';

// src/components/panelTab/QueueTab.tsx

interface QueueTabProps {
    playQueue: SongResult[];
    currentSong: SongResult | null;
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    queueScrollRef: React.RefObject<HTMLDivElement | null>;
    shouldScrollToCurrent?: boolean;
    onShuffle?: () => void;
    onRemoveSong: (index: number) => void;
    onMoveSongToEnd: (index: number) => void;
    onMoveSongToNext: (index: number) => void;
    canSaveLocalPlaylist?: boolean;
    /** Opens the same queue as a poster wall; absent when the host has no wall to show. */
    onOpenLattice?: () => void;
    onSaveCurrentQueueAsPlaylist?: (name: string) => Promise<void>;
    isDaylight?: boolean;
}

type QueueRowProps = {
    playQueue: SongResult[];
    currentSongKey: string | null;
    onPlaySong: QueueTabProps['onPlaySong'];
    onMoveSongToNext: QueueTabProps['onMoveSongToNext'];
    onMoveSongToEnd: QueueTabProps['onMoveSongToEnd'];
    onRemoveSong: QueueTabProps['onRemoveSong'];
    isDaylight: boolean;
    labels: {
        unavailable: string;
        playNext: string;
        moveToEnd: string;
        remove: string;
    };
};

// Kept outside QueueTab so track changes update row data without remounting hovered action buttons.
const QueueRow = ({
    index,
    style,
    ariaAttributes,
    playQueue,
    currentSongKey,
    onPlaySong,
    onMoveSongToNext,
    onMoveSongToEnd,
    onRemoveSong,
    isDaylight,
    labels,
}: RowComponentProps<QueueRowProps>): React.ReactElement => {
    const song = playQueue[index];
    const slots = useQueueEntrySlots(song, 'panel', [
        { id: 'host:queue-play-next', kind: 'button', label: { en: labels.playNext }, icon: 'list-plus', run: () => onMoveSongToNext(index) },
        { id: 'host:queue-move-end', kind: 'button', label: { en: labels.moveToEnd }, icon: 'list-end', run: () => onMoveSongToEnd(index) },
        { id: 'host:queue-remove', kind: 'button', label: { en: labels.remove }, icon: 'trash-2', run: () => onRemoveSong(index) },
    ]);
    const isActive = currentSongKey === getQueueSongKey(song);
    const isUnavailable = isSongUnavailable(song);
    const unavailableTagText = getSongUnavailableLabel(song, labels.unavailable);
    const activeRowClass = isDaylight ? 'bg-black/[0.08]' : 'bg-white/20';
    const activeMarkerClass = isDaylight ? 'bg-zinc-700' : 'bg-white';
    const hoverRowClass = isDaylight ? 'hover:bg-black/[0.04]' : 'hover:bg-white/5';

    return (
        <div
            style={style}
            onClick={() => { if (!activateQueueViewSong(song)) onPlaySong(song, playQueue); }}
            data-active={isActive}
            {...ariaAttributes}
            className={`group flex items-center gap-3 px-2 py-1 rounded-lg cursor-pointer transition-colors
                ${isActive ? activeRowClass : hoverRowClass} ${isUnavailable ? 'opacity-55' : ''}`}
        >
            <div className={`w-1 h-6 rounded-full ${isActive ? activeMarkerClass : 'bg-transparent'}`} />
            <div className="min-w-0 flex-1">
                <QueueSlotItems items={slots.overline} className="text-[9px]" />
                <div className="text-xs font-medium truncate">
                    {song.name}
                    {isUnavailable && (
                        <span className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium align-middle ${isDaylight ? 'border-black/8 bg-black/[0.04] text-zinc-600' : 'border-white/10 bg-white/[0.05] text-zinc-300'}`}>
                            {unavailableTagText}
                        </span>
                    )}
                </div>
                <div className="text-[10px] opacity-40 truncate">{getSongArtistLabel(song)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
                <QueueSlotItems items={slots.actions} size={13} />
            </div>
        </div>
    );
};

const QueueTab: React.FC<QueueTabProps> = ({
    playQueue: privateQueue,
    currentSong: privateCurrentSong,
    onPlaySong,
    queueScrollRef,
    shouldScrollToCurrent = false,
    onShuffle,
    onRemoveSong,
    onMoveSongToEnd,
    onMoveSongToNext,
    canSaveLocalPlaylist = false,
    onOpenLattice,
    onSaveCurrentQueueAsPlaylist,
    isDaylight = false,
}) => {
    const { t } = useTranslation();
    const view = useQueueView();
    const playQueue = view?.queue ?? privateQueue, currentSong = view ? view.currentSong : privateCurrentSong;
    const header = useUiSlots('queue.header', {
        leading: [{ id: 'host:queue-title', kind: 'text', label: { en: `${t('queue.title')} (${view?.totalCount ?? playQueue.length})` } }],
        trailing: [
            ...(onOpenLattice ? [{ id: 'host:queue-wall', kind: 'button' as const, label: { en: t('home.lattice') }, icon: 'panels-top-left', run: onOpenLattice }] : []),
            ...(view ? queueViewHeaderActions() : [
                ...(canSaveLocalPlaylist ? [{ id: 'host:queue-save', kind: 'button' as const, label: { en: t('localMusic.saveQueueAsPlaylist') }, run: () => setIsSaveDialogOpen(true) }] : []),
                ...(onShuffle ? [{ id: 'host:queue-shuffle', kind: 'button' as const, label: { en: t('queue.shuffle') }, icon: 'shuffle', run: onShuffle }] : []),
            ]),
        ],
    }, { surface: 'panel' });
    const ITEM_HEIGHT = view ? 62 : 50;
    const currentSongKey = currentSong ? getQueueSongKey(currentSong) : null;
    // Adjust container height calculation if needed, or rely on flex
    // previously CONTAINER_HEIGHT = 200 was passed to List. 
    // We should make List take available space.
    // However, react-window List needs explicit height.
    // The parent has max-h-[300px]. 
    // If we add a header, we need to subtract its height from the List height or use AutoSizer.
    // For simplicity given the constraints, let's try to fit it.
    // The parent is flex-col. 
    // Let's reduce List height slightly to accommodate header? 
    // Or better, use Autoizer? No, let's stick to simple fixed height for now but slightly reduced: 300 - 32 (header) = 268?
    // User asked for "about 5 songs height". 5 * 50 = 250.
    // Let's set CONTAINER_HEIGHT to 250.
    const CONTAINER_HEIGHT = 250;

    const listRef = useListRef(null);
    const isInitialMountRef = React.useRef(true);
    const lastScrolledIndexRef = React.useRef<number>(-1);
    const wasOpenRef = React.useRef(false);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
    const rowProps = React.useMemo<QueueRowProps>(() => ({
        playQueue,
        currentSongKey,
        onPlaySong,
        onMoveSongToNext,
        onMoveSongToEnd,
        onRemoveSong,
        isDaylight,
        labels: {
            unavailable: t('status.songUnavailableTag'),
            playNext: t('queue.playNext'),
            moveToEnd: t('queue.moveToEnd'),
            remove: t('queue.remove'),
        },
    }), [
        currentSongKey,
        isDaylight,
        onMoveSongToEnd,
        onMoveSongToNext,
        onPlaySong,
        onRemoveSong,
        playQueue,
        t,
    ]);

    // Reset initial mount state when panel is opened
    React.useEffect(() => {
        if (shouldScrollToCurrent && !wasOpenRef.current) {
            isInitialMountRef.current = true;
            wasOpenRef.current = true;
        } else if (!shouldScrollToCurrent) {
            wasOpenRef.current = false;
        }
    }, [shouldScrollToCurrent]);

    // Auto-scroll to current song
    React.useEffect(() => {
        if (shouldScrollToCurrent && currentSongKey && listRef.current) {
            const currentIndex = playQueue.findIndex(song => getQueueSongKey(song) === currentSongKey);
            if (currentIndex >= 0) {
                const isInitialMount = isInitialMountRef.current;
                const songChanged = lastScrolledIndexRef.current !== currentIndex && lastScrolledIndexRef.current !== -1;

                const behavior = (isInitialMount || !songChanged) ? 'instant' : 'smooth';
                const delay = isInitialMount ? 0 : 50;

                setTimeout(() => {
                    if (listRef.current) {
                        listRef.current.scrollToRow({
                            index: currentIndex,
                            align: 'center',
                            behavior: behavior as 'instant' | 'smooth'
                        });
                        lastScrolledIndexRef.current = currentIndex;
                        isInitialMountRef.current = false;
                    }
                }, delay);
            }
        }
    }, [shouldScrollToCurrent, currentSongKey, playQueue, listRef]);

    return (
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full max-h-[300px] select-none">
                <div className="flex items-center justify-between px-2 pb-2 shrink-0">
                    <QueueSlotItems items={header.leading} className="text-xs font-medium" />
                    <QueueSlotItems items={header.trailing} />
                </div>

                <div
                    ref={queueScrollRef}
                    className="flex-1 -mx-2 px-2 overflow-hidden"
                >
                    {playQueue.length ? <List
                        listRef={listRef}
                        rowCount={playQueue.length}
                        rowHeight={ITEM_HEIGHT}
                        rowComponent={QueueRow}
                        rowProps={rowProps}
                        overscanCount={5}
                        className="custom-scrollbar"
                        style={{ height: CONTAINER_HEIGHT, width: '100%' }}
                    /> : <div className="flex h-full items-center justify-center text-xs opacity-40">{t('queue.empty')}</div>}
                </div>
            </motion.div>

            <TextInputDialog
                isOpen={isSaveDialogOpen}
                onClose={() => setIsSaveDialogOpen(false)}
                isDaylight={isDaylight}
                title={t('localMusic.saveQueueAsPlaylist')}
                description={t('localMusic.enterPlaylistName')}
                placeholder={t('localMusic.enterPlaylistName')}
                confirmLabel={t('localMusic.save')}
                onConfirm={async (playlistName) => {
                    try {
                        await onSaveCurrentQueueAsPlaylist?.(playlistName);
                    } catch (error) {
                        console.error('Failed to save local playlist', error);
                    }
                }}
            />
        </>
    );
};

export default QueueTab;

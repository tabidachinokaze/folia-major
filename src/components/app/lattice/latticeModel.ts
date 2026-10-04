import type { SongResult } from '../../../types';
import { getSongArtistLabel, getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
import { getQueueSongKey } from '../../../utils/appPlaybackGuards';

// Projects the play queue onto the wall; queue order is the only source of truth.

export type LatticeSection = 'played' | 'now' | 'upcoming';

export type LatticeTile = {
    id: string;
    /** Zero-based position in the play queue; the poster badge shows it as a 1-based number. */
    queueIndex: number;
    song: SongResult;
    title: string;
    artist: string;
    coverUrl?: string;
    section: LatticeSection;
};

// Marks entries relative to the playhead; external sessions preserve repeated media by occurrence ID.
export const buildLatticeTiles = ({
    queue,
    currentSong,
}: {
    queue: SongResult[];
    currentSong: SongResult | null;
}): LatticeTile[] => {
    const currentKey = currentSong ? getQueueSongKey(currentSong) : null;
    const currentIndex = currentKey === null
        ? -1
        : queue.findIndex(song => getQueueSongKey(song) === currentKey);

    return queue.map((song, index) => {
        let section: LatticeSection = 'upcoming';
        if (index === currentIndex) section = 'now';
        else if (currentIndex >= 0 && index < currentIndex) section = 'played';

        return {
            id: getQueueSongKey(song),
            queueIndex: index,
            song,
            title: song.name,
            artist: getSongArtistLabel(song) || song.album?.name || 'Unknown artist',
            coverUrl: getSongCoverUrl(song) || song.album?.coverUrl,
            section,
        };
    });
};

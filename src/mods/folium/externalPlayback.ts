import { omni } from '@/services/onlineMusic/omni';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { currentTime } from '@/stores/motionSignals';
import { PlayerState, type SongResult } from '@/types';
import type { FoliumSong } from './contract';
import { resolveFoliumSongRef, toFoliumSong } from './dto';
import {
    acquireExternalPlayback, isExternalPlaybackOwner, releaseExternalPlayback,
    runExternalPlaybackCommand, type ExternalPlaybackIntent,
} from '@/services/externalPlaybackSession';

// src/mods/folium/externalPlayback.ts
// Versioned, opt-in internal bridge for a server-owned play queue. No provider credentials escape here.
type Actions = {
    play: (song: SongResult, token: symbol) => Promise<void>;
    pause: () => void;
    seek: (seconds: number) => void;
};
let actions: Actions | null = null;
export const registerExternalPlaybackActions = (value: Actions | null) => { actions = value; };

export const externalPlaybackBridge = Object.freeze({
    version: 1,
    async resolveSong(provider: string, id: string): Promise<FoliumSong> {
        if (provider !== 'netease' || !/^[1-9]\d{0,23}$/.test(id)) throw new Error('歌曲来源或 ID 无效');
        const song = await omni.getSongDetail('netease', id);
        if (!song) throw new Error('未找到这首网易云歌曲');
        return toFoliumSong(song)!;
    },
    acquire(dispatch: (intent: Omit<ExternalPlaybackIntent, 'song'> & { song?: FoliumSong }) => void) {
        if (!actions) throw new Error('播放器尚未就绪');
        const state = usePlaybackStore.getState();
        if (state.activePlaybackContext === 'stage' || state.transitionDisplay) {
            throw new Error('请先结束 Stage 播放或等待歌曲过渡完成');
        }
        const queue = state.playQueue;
        const token = acquireExternalPlayback(intent => dispatch(
            intent.type === 'select' ? { type: 'select', song: toFoliumSong(intent.song)! } : intent,
        ));
        actions.pause();
        state.setPlayQueue([]);
        state.setIsFmMode(false);
        return Object.freeze({
            async play(song: FoliumSong) {
                if (!isExternalPlaybackOwner(token)) return false;
                const resolved = resolveFoliumSongRef(song.ref);
                if (!resolved || toFoliumSong(resolved)?.source !== 'netease') throw new Error('歌曲引用已失效，请重新同步');
                await actions!.play(resolved, token);
                return isExternalPlaybackOwner(token);
            },
            seek(seconds: number) {
                if (!Number.isFinite(seconds) || seconds < 0) throw new Error('播放进度无效');
                runExternalPlaybackCommand(token, () => actions!.seek(seconds));
            },
            release() {
                if (!isExternalPlaybackOwner(token)) return;
                actions?.pause();
                releaseExternalPlayback(token);
                // Restore the user's queue without starting music after leaving/disabling a mod.
                usePlaybackStore.setState({ playQueue: queue, currentSong: null, audioSrc: null,
                    lyrics: null, cachedCoverUrl: null, duration: 0, playerState: PlayerState.IDLE,
                    currentLineIndex: -1, isFmMode: false });
                currentTime.set(0);
            },
        });
    },
});

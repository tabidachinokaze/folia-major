# Experimental playback sessions

`folium.experimental['playback.sessions']` lets a mod own song selection and the queue while a remote system supplies the playback timeline. It reuses Folia's audio, lyrics and provider pipelines. Room protocols, authentication and networking remain in the mod.

Declare both capabilities in `mod.json`:

```json
{
  "folium": 1,
  "id": "session-example",
  "version": "1.0.0",
  "client": "client.mjs",
  "permissions": ["playback.control"],
  "experimental": ["playback.sessions"]
}
```

The service is available only in the main renderer. It does not require `internals` or a pinned `folia` range. Older hosts that do not recognize this capability reject the manifest; mods should publish a compatible package for those hosts separately. The current service contract version is `2`; the surface remains experimental.

```js
export default function activate(folium) {
    const sessions = folium.experimental['playback.sessions'];
    if (sessions.version !== 2) throw new Error('Unsupported playback session version');
    const session = sessions.acquire({
        restore: 'queue-stopped',
        onIntent(intent) {
            switch (intent.type) {
                case 'play':
                    // Forward intent.song through the mod's own protocol.
                    break;
                case 'enqueue':
                    // Forward all intent.songs as one user selection.
                    break;
                case 'queue-action':
                    // Validate intent.entryId/actionId against the mod's latest remote snapshot.
                    break;
                case 'seek':
                    // seconds is audio time; resume preserves the originating control's policy.
                    break;
                case 'next':
                case 'previous':
                case 'ended':
                case 'playback-error':
                    // Distinguish user commands, natural boundaries and audio failure.
                    break;
            }
        },
    });
    return () => session.release();
}
```

## Ownership and restoration

Only one session can own the player. Acquisition rejects FM, Stage, active video recording and an active transition before changing their state. These contexts need their own restoration policies; this version does not flatten them into a normal queue.

`queue-stopped` is the supported restoration policy. The current source is stopped at acquisition. Release restores a copy of the previous queue, clears the current song/audio/lyrics, and keeps playback stopped. Volume and the user's loop/transition preferences remain intact. Looping and automix are temporarily disabled while a session owns the player.

Pause, resume and volume remain local controls. Play, enqueue, next, previous and seek intents go to the owning mod. Native personal-queue reordering/clearing and Stage queue-edit requests are unavailable while a session owns the queue; a mod publishes its remote queue and available actions with `session.setQueue`. Stage entry and recording the main player window are rejected until the session is released.

Normal release, mod disable/reload, failed activation and host teardown all release ownership and invalidate in-flight source loads. The host cleans up even if the mod's disposer throws. Retained service objects cannot reacquire ownership after disposal. A synchronous or asynchronous `onIntent` failure is reported through Folium diagnostics and releases the session; mods should catch recoverable network/business errors themselves.

## Resolving and loading songs

`resolveSong(provider, id)` uses Omni to resolve an online provider's opaque media ID into a `FoliumSong` with a host `ref`. Provider-specific restrictions belong to the mod. Songs obtained from host notifications/hooks can also be passed to `session.play`, including host refs for local and Navidrome tracks.

`session.play(song)` loads without autoplay and returns one of these statuses:

| Status | Meaning |
| --- | --- |
| `source-committed` | The source was assigned to the player. This does not guarantee metadata, decoding or audible playback. |
| `cancelled` | A hook cancelled, the session ended, or the host did not commit a source. |
| `superseded` | A newer source request overtook this one. |
| `unavailable` | The ref or source was unavailable. |
| `failed` | Loading failed; diagnostics contain the error. |

After `source-committed`, wait for the expected song and a usable duration in `folium.playback.getState()`, apply the remote timeline with `session.seek(seconds)`, then resume with `folium.playback.play()` if the user is listening. `session.seek` preserves pause state, clamps to the media duration and never broadcasts an intent. It is ignored before the media has metadata.

Every source load participates in the same request lifecycle. Acquiring/releasing a session or starting another song prevents older online/local/Navidrome/Stage loads from committing. Uncommitted blob URLs are released on cancellation; resources already handed to Folia keep the existing deck-aware cleanup behavior.

## Native queue and home surfaces (v2)

`session.setQueue({ entries, currentId, actions, syncActionId, canNext })` publishes ordered queue occurrences to the native player panel, command-palette queue search and Lattice collage. Include the current occurrence in `entries`. Each entry has a unique session-local `id`, media metadata in `track` (duration in **seconds**), and an `actions` array. An optional `track.ref` reuses richer metadata from a resolved host song. Repeated media IDs must have distinct occurrence IDs.

Toolbar actions replace native shuffle; `syncActionId` selects the toolbar action used by configured shuffle slots and the Sync queue command. Per-entry actions replace native reorder/remove buttons. Clicks produce `{ type: 'queue-action', entryId, actionId }`; toolbar actions use `entryId: null`. A count is a display value, never a one-time vote limit. The host validates actions against the latest snapshot; the mod still checks remote authorization and handles failures. Without `defaultAction`, selecting an entry consumes the click without starting local playback or emitting a new recommendation. Native batch mutations remain unavailable.

Presentation never changes the private audio queue or cache identity. Unchanged tracks retain object identity across vote/heartbeat updates, keeping the collage stable. `canNext` controls navigation independently of the private queue length. `totalCount` and `loading` describe a paginated queue refresh. Release clears presentation and restores the private queue; stale occurrence actions cannot affect a new session. `session.stop()` cancels a pending load and clears audio/lyrics while retaining ownership, for a remote room with no current song.

`folium.ui.openQueue()` opens the native player queue. Input in a mod's shadow root does not trigger typing-sensitive playback shortcuts.

## Validation

Regression coverage includes capability gates, opaque provider IDs, payload types, cancelled/superseded requests, mod activation/disposal errors, host teardown, queue restoration, FM/Stage rejection, arrow-key routing, batch enqueue, delayed local/Navidrome results and blob cleanup. Coverage also checks duplicate occurrences, repeatable actions, stale-session rejection, stable queue identity, home-tab teardown and nested shadow input. See `test/unit/mod-system/*Playback*.test.ts` and the generated [API reference](api.md).

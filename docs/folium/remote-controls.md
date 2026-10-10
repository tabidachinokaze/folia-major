# Independent remote action lists

Folium 1.5 adds `folium.registries.remoteControls.register({ id, order, edit })`. A synchronous editor receives copies of the ordered `transport` and `actions` arrays, plus immutable displayed-song and availability context. Insert, delete, reorder or rewrite entries with ordinary array operations. Lower `order` runs first (default 500); equal priorities use registration order.

Native ids are `host:previous`, `host:play-pause`, `host:next`, `host:loop` and `host:like`. The heart means the user's personal collection. A mod's repeated reaction belongs to a separate namespaced button, for example `music-party:vote`, with its own callback and optional count. A count or pressed appearance does not limit clicks.

Callbacks execute in the main playback renderer. Window controls, volume, seeking and recording remain native; this API does not grant playback-session ownership. New button ids must begin with the registering mod's id. Labels use the host's localized label format, icons use host lucide names, and each list is limited to 32 entries. Keep lists short enough for the compact remote window. Invalid or asynchronous edits are discarded and logged; later editors still run. Native disabled guards cannot be bypassed.

Call `folium.ui.refreshRemoteControls()` after mod state changes. This also invalidates outstanding activation tickets, so call it when a button's business target changes even if the media id is unchanged. Unregistering or disabling a mod invalidates its callbacks and restores the remaining contributors or native layout. The export context accepts inert registrations and cannot refresh remote UI.

The remote window receives only validated button descriptions and opaque epoch/revision/song/group/id/handle tickets. Electron validates against its last published snapshot; the main playback renderer resolves current actions and checks the live displayed song again. An old song, renderer, registration, state revision, disabled entry or mismatched ticket cannot execute a callback.

See `dev/folium/sample-remote-controls` for an installable offline demo, and `?probe=remoteControls` on the development probe page for the real remote component with in-memory IPC. Browser fixtures verify the UI and callbacks; actual Electron IPC and room operations still need human validation.

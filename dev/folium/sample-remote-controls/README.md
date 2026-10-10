# Remote action list demo

Copy this folder into the user mod directory, or zip `mod.json` and `client.mjs` at the archive root and import it. This is an unsigned development sample, not a bundled official mod. It requires the #551 host branch.

Play any local song and open the independent remote window. The demo reaction is inserted before the native personal-collection heart. Hover or focus it with the keyboard to see the count. Click it repeatedly: its count grows without changing the heart. Check the mod logs for the action and displayed song id.

In the command palette, run the commands beginning with “Toggle remote demo”, “Reverse remote buttons”, and “Replace remote loop”. Verify insertion/removal, ordering and rewriting. Disable the mod: all native remote buttons must return. Check both daylight and dark themes, hover previews, pause/continue, and previous/next availability. The window/recording tools must still work.

This fixture does not connect to Music Party. Actual room reactions and external-session transport require a separate playback API implementation and validation.

Folia asynchronous resume/pause race — manual comparison evidence

Tested and recorded by the contributor on 2026-10-07.
Before: 2026-10-07 05-48-20.mp4 — original official Electron build.
After: 2026-10-07 05-50-51.mp4 — fix commit b83a16bb99f25fc258dd65497f0196bc8fa5ce54.
The contributor confirmed that the fixed build remains paused after the delayed play() completion.

Reproduction: disable playback fade; delay completion of the next real play() Promise by 3 seconds;
resume playback, pause within 1 second of hearing audio, then wait 4 seconds.
This controlled delay exposes the asynchronous ordering race; it does not measure normal playback latency.

These are the original, unmodified recordings. This evidence branch contains only demonstration media;
the code review branch is pr/playback-pending-resume.

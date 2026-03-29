---
description: Processes audio tracks into DASH/MPD format via BullMQ and ffmpeg
---

Create a BullMQ job for DASH processing:

- Use fluent-ffmpeg (never spawn)
- Input: MixTrack[] from shared-schemas
- Output: manifest.mpd + segments/
- 2-second segments, baseline profile
- loudnorm filter for normalization

# Project Video: Version 1 vs. Version 2

## Overview

This folder documents and reproduces a five-minute comparison video for the
Ocean Work project. The video explains how the project evolved from a
voxel-first visual prototype into a mixed-size LEGO-style construction system.

The comparison focuses exclusively on modeling, physical structure, rendering,
and engineering organization.

## Video Contents

The video covers:

1. The shared text/image-to-Gemini-to-voxel-to-Three.js workflow.
2. The Version 1 Eagle model and its one-voxel-per-part representation.
3. Structural limitations such as disconnected regions, weak side contact, and
   unsupported cantilevers.
4. Version 2 goals: buildability, connectivity, structural stability, and
   maintainability.
5. Mixed-size bricks from `1x1` through `2x8`.
6. Support columns, bridge repair, cantilever limits, interlocked foundations,
   and seam-interlock scoring.
7. Runtime metrics for the Eagle, Fox, and Tiger examples.
8. Server-side generation, model fallback, team ownership, and bundle-size
   changes.
9. The known text-encoding issue in the Version 2 archive.

## Directory Guide

- `evidence/screenshots/`: screenshots captured from the two running versions.
- `evidence/diagrams/`: rendered overview and brick-layout diagrams.
- `evidence/metrics/`: visual and machine-readable comparison metrics.
- `hyperframes/`: editable HyperFrames source and the rendered final video.

## Evidence Summary

| Example | Version | Voxels | Parts | Part strategy |
|---|---:|---:|---:|---|
| Eagle | 1 | 932 | 932 | Primarily `1x1` |
| Fox | 2 | 5,734 | 1,317 | Mixed-size bricks |
| Tiger | 2 | 2,841 | 636 | Mixed-size bricks |

Production JavaScript measured during the build:

- Version 1: approximately `1.21 MB`
- Version 2: approximately `0.94 MB`

## Reproduce the HyperFrames Video

From `project-video/hyperframes`:

```powershell
npx hyperframes lint
npx hyperframes validate
npx hyperframes inspect --samples 15 --strict
npx hyperframes preview
npx hyperframes render --quality high --fps 30 --output final_video.mp4
```

Expected output:

- Resolution: `1920x1080`
- Frame rate: `30 FPS`
- Duration: `300 seconds`
- Frame count: `9,000`
- Audio: none

## Submission Note

All source files and evidence can be committed to GitHub. The rendered
`hyperframes/final_video.mp4` is ignored by the local `.gitignore` because the
assignment specifies that the video is submitted separately.

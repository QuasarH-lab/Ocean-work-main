# Build and Video Validation

## Application Builds

- Version 1 passed `tsc --noEmit`.
- Version 1 passed the Vite production build.
- Version 2 initially failed because damaged text encoding produced unterminated
  string literals.
- After correcting only those damaged strings in a temporary copy, Version 2
  passed `tsc --noEmit` and the Vite production build.

## Bundle Metrics

- Version 1 JavaScript bundle: approximately 1.21 MB.
- Version 2 JavaScript bundle: approximately 0.94 MB.

## Video Validation

- HyperFrames lint: 0 errors, 0 warnings.
- Browser validation: no console errors.
- Contrast validation: 575 text elements passed WCAG AA.
- Layout inspection: 0 issues across 15 timeline samples.
- Final video: H.264, 1920x1080, 30 FPS, 300 seconds, 9,000 frames.

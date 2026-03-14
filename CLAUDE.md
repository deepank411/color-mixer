# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web application for "Stone Factory Pigment Color Mixer." It matches colors from uploaded images to pigment recipes using 5 Bayferrox iron oxide pigments (Red 4110, Green, Black 4330, Brown 4686, Yellow 4920) mixed into white cement. Uses Kubelka-Munk spectral mixing via Spectral.js for physically accurate color predictions. No build system — just open `index.html` in a browser.

## File Structure

```
color-mixer/
├── index.html          (~127 lines)  HTML structure, loads CSS + JS
├── styles.css          (~542 lines)  All CSS, dark theme, mobile-responsive
├── app.js              (~861 lines)  All application logic
└── spectral.min.js     (~12KB)       Spectral.js v3.0.0 (MIT, Kubelka-Munk mixing)
```

## Architecture

### `styles.css`

Dark-themed UI with CSS custom properties in `:root`. Mobile-responsive at 600px breakpoint. Pigment color vars (`--red`, `--green`, `--black-pig`, `--brown`, `--yellow`) match Bayferrox product colors.

### `index.html`

Card-based layout — image upload, target color display, recipe bars, fine-tuning sliders, settings panel. Loads `spectral.min.js` before `app.js`.

### `app.js` — Key Sections

- **Color Science** (~line 30): Full sRGB ↔ Linear RGB ↔ XYZ (D65) ↔ CIELAB conversion pipeline. Both ΔE CIE76 and ΔE CIE2000 are implemented; CIE2000 is used for recipe optimization and quality display.
- **Mixing Model** (~line 140): Kubelka-Munk spectral mixing via `spectral.mix()`. Caches `spectral.Color` objects (`_cachedSpectral`) keyed on pigment/white RGB values, invalidated on calibration change. `mixColor(percentages)` returns CIELAB `[L, a, b]`.
- **Optimization** (~line 170): Three-phase recipe solver:
  - Phase 1: Coarse 5-nested-loop grid search at 5% increments
  - Phase 2: Fine grid at 0.5% increments within ±5% of best coarse result
  - Phase 3: Coordinate descent at 0.1% increments, 3 passes
- **K-Means Clustering** (~line 240): k-means++ initialization, used to extract 5 dominant colors from sampled image pixels (top 3 shown as selectable swatches).
- **Eyedropper/Loupe** (~line 380): Manual pixel picking mode with magnified loupe overlay. Supports both mouse and touch events.
- **Fine-Tuning Sliders** (~line 530): Manual recipe adjustment with proportional scale-down when total exceeds `MAX_PIGMENT_LOAD`.

### `spectral.min.js` — Spectral.js v3.0.0

Third-party library (MIT). Key API used:
- `new spectral.Color(rgbArray)` — create color from `[r, g, b]` (0-255)
- `spectral.mix([color, factor], ...)` — Kubelka-Munk spectral mixing across 38 wavelengths
- `.sRGB` — `[r, g, b]` array (0-255) on result Color objects

### Important State Variables

- `PIGMENTS` array: 5 pigments with `name`, `rgb`, `color` (hex). Mutated in-place by calibration UI.
- `WHITE_CEMENT`: RGB array for the cement base color.
- `MAX_PIGMENT_LOAD`: Max total pigment percentage (default 30%).
- `targetColor`, `autoRecipe`, `currentRecipe`: Current selection and computed/adjusted recipe.

### Color pipeline constraint

Color mixing happens via Kubelka-Munk spectral model (Spectral.js), which operates on 38-wavelength reflectance curves internally. The result is converted to sRGB then to CIELAB for comparison (ΔE2000). RGB is only used for display and input. When modifying the mixing model, work through the `spectral.Color` / `spectral.mix` API.

### Performance note

The optimizer calls `mixColor()` thousands of times per run. Each call goes through `spectral.mix()` (38-wavelength math). `spectral.Color` objects are cached and only recreated on calibration change. If optimization becomes too slow (>3s), consider extracting raw K/S arrays from cached Color objects for the inner loop.

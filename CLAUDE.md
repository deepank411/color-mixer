# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-file web application (`color-mixer.html`) for "Stone Factory Pigment Color Mixer." It matches colors from uploaded images to pigment recipes using 5 pigments (Red, Green, Black, Brown, Yellow) mixed into white cement. No build system, no dependencies — just open the HTML file in a browser.

## Architecture

Everything lives in one self-contained HTML file with three inline sections:

1. **CSS** (lines 7–550): Dark-themed UI with CSS custom properties in `:root`. Mobile-responsive at 600px breakpoint.
2. **HTML** (lines 552–665): Card-based layout — image upload, target color display, recipe bars, fine-tuning sliders, settings panel.
3. **JavaScript** (lines 667–1532): All application logic, organized into labeled sections:

### Key JS Sections

- **Color Science** (~line 695): Full sRGB ↔ Linear RGB ↔ XYZ (D65) ↔ CIELAB conversion pipeline. Both ΔE CIE76 and ΔE CIE2000 are implemented; CIE2000 is used for recipe optimization and quality display.
- **Mixing Model** (~line 822): Weighted-average mixing in CIELAB space. Uses a cache (`_cachedPigmentLabs`) keyed on pigment/white RGB values, invalidated on calibration change.
- **Optimization** (~line 870): Three-phase recipe solver:
  - Phase 1: Coarse 5-nested-loop grid search at 5% increments
  - Phase 2: Fine grid at 0.5% increments within ±5% of best coarse result
  - Phase 3: Coordinate descent at 0.1% increments, 3 passes
- **K-Means Clustering** (~line 958): k-means++ initialization, used to extract 5 dominant colors from sampled image pixels (top 3 shown as selectable swatches).
- **Eyedropper/Loupe** (~line 1112): Manual pixel picking mode with magnified loupe overlay. Supports both mouse and touch events.
- **Fine-Tuning Sliders** (~line 1329): Manual recipe adjustment with proportional scale-down when total exceeds `MAX_PIGMENT_LOAD`.

### Important State Variables

- `PIGMENTS` array: 5 pigments with `name`, `rgb`, `color` (hex). Mutated in-place by calibration UI.
- `WHITE_CEMENT`: RGB array for the cement base color.
- `MAX_PIGMENT_LOAD`: Max total pigment percentage (default 30%).
- `targetColor`, `autoRecipe`, `currentRecipe`: Current selection and computed/adjusted recipe.

### Color pipeline constraint

All color mixing and comparison happens in CIELAB space. RGB is only used for display and input. When modifying the mixing model or optimization, work in Lab coordinates.

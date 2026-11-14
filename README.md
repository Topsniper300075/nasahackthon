# Aurelia Mars Mission Console

A polished, responsive prototype for the 2026 NASA Space Apps Challenge. The console combines a Mars surface visualization, hazard overlays, mission controls, route metrics, and an exportable mission brief.

## Run locally

This is a dependency-free web prototype:

```bash
npx serve .
```

Open the printed local URL. `npm run check` validates the JavaScript syntax.

## Architecture

- `index.html` — semantic HUD layout and controls.
- `styles.css` — responsive dark mission-console UI with a light accessibility mode.
- `app.js` — procedural Mars visualization, overlays, route metrics, coordinate readout, and mission brief export.

The current map is intentionally local and deterministic so the demo works offline. The UI now includes a transparent data-provenance drawer with direct links to the official source products. The canvas renderer is the integration point for MOLA elevation tiles, THEMIS thermal/radiation products, SHARAD ice detections, USGS/NASA geology layers, PDS surface imagery, and Mars 2020 science context.

## Local NASA data bundle

The `data/` directory contains downloaded NASA products used by the running app:

- `mars-weather.json` — NASA Mars weather feed; the HUD reads its latest available sol.
- `curiosity-martian-surface.jpg` — NASA image asset PIA16018; rendered as the full-bleed primary Mars surface background beneath the HUD.
- `curiosity-surface-collection.json` — NASA asset manifest for the image.
- `nasa-curiosity-surface-search.json` and `nasa-mars-imagery-search.json` — NASA image-search metadata used to document the asset origin.
- `manifest.json` — source URLs, providers, local usage, and planned data adapters.
- `mola/mola-topography-16ppd.img` — official MOLA MEGDR topography product at 16 pixels/degree.
- `mola/mola-topography-16ppd.xml` — PDS4 label describing the MOLA binary format and coordinate coverage.

The app loads these with `fetch("data/...")` at startup. Once the image is loaded, the canvas uses a cover-scaled NASA surface photograph as its primary background and draws the route, contours, radiation, dust, seismic, labels, and coordinates over it. If a file is missing, it explicitly retains the offline simulation and logs the fallback; it does not pretend the missing source is live.

The MOLA IMG is now actively consumed by the app. `loadMOLA()` samples the official global 16 ppd big-endian signed 16-bit topography product over 134°E–141°E and 9°S–2°S, builds a local triangle mesh, and renders it as a WebGL heightfield. The same sampled grid generates elevation contours and an A* route whose cost increases with local elevation change. The route profile and ascent metric are derived from the route's MOLA samples, not hand-authored screen coordinates. The terrain status changes to `MOLA 16 PPD ELEVATION` when loaded.

The map viewport supports an orbital bird's-eye view and a slanted 2.5D view. Dragging rotates the projection, `Shift` + dragging pans it, zoom controls change scale, and **TRAVERSE** animates a rover marker along the planned route. These are camera/projection interactions over a MOLA-derived 3D heightfield with NASA imagery retained as the fallback texture. The route and hazard layers are still illustrative until each hazard product is georeferenced into the same MOLA coordinate frame.

The **SIDE** view is a fixed route cross-section: it plots the MOLA elevation of each computed route sample against distance, draws real elevation bands, labels the base and Mount Sharp goal, and uses the same zoom controls. It is intentionally not a free camera view, so height and relief remain legible and scientifically interpretable.

The map also shows the direct-line comparison and hazard zones. “WHY THIS PATH” explains the route trade-offs: relief/ascent avoided, detour distance, and the MOLA-derived elevation profile. Hazard zones are explicitly marked as modeled overlays; they must not be presented as measured radiation, dust, or seismic observations until those products are georeferenced and loaded.

MOLA, SHARAD, USGS geology, THEMIS, and InSight seismic products are linked and identified in the provenance drawer but are not bundled yet because the official archives are large or require a product-specific query/coordinate selection. The next production step is to download a small, region-specific extract for each and add it to the same loader contract.

## NASA challenge alignment

The challenge asks for a layered, integrated view of a Mars location or route that combines data from multiple NASA science missions and helps a human explorer plan a safe Marswalk while accomplishing science. Aurelia addresses that brief through:

- **Impact:** risk-aware traverse planning with terrain, radiation, dust, seismic, and distance factors.
- **Creativity:** a mission HUD that turns scientific layers into astronaut decisions rather than a static map.
- **Validity:** explicit data provenance and source contracts, with simulation status clearly labeled until live adapters are connected.
- **Relevance:** mission objectives change the science goal and route context.
- **Presentation:** a guided route story, insight cards, waypoint list, responsive HUD, and exportable mission brief.

These are the five criteria named in the official [NASA Space Apps 2026 Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/). The project should not claim live NASA data until the corresponding adapters are implemented and their timestamps/coordinate systems are shown in the UI.

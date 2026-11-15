# Aurelia Mars Mission Console — Sources

This file is the human-readable source index for the Aurelia demonstration. It
lists the official NASA, PDS, USGS, and partner sources used by the application,
the local files derived from those sources, and the role each source currently
plays.

The machine-readable records are also available in:

- [`data/manifest.json`](data/manifest.json) — downloaded files and source URLs.
- [`data/science-layers.json`](data/science-layers.json) — science-layer status,
  route-cost eligibility, and caveats.

## Important interpretation note

The application separates **active route inputs** from **context-only** and
**planned** science layers. At present, only the MOLA-derived terrain grid,
Mars-surface distance, and corridor constraint affect the A* route cost.
Station observations, catalogs, point measurements, browse imagery, and
unregistered orbital products are not represented as spatial hazard rasters.
They must not be interpreted as local measured radiation, dust, seismic,
chemical, or obstacle fields.

## Sources used by the running application

| Topic | Official source | Local file or implementation | Current use |
|---|---|---|---|
| Mars topography | [MGS MOLA MEGDR/PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) and the [bundled 16 pixels/degree product](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megt90n000eb.img) | [`data/mola/mola-topography-16ppd.img`](data/mola/mola-topography-16ppd.img), [`data/mola/mola-topography-16ppd.xml`](data/mola/mola-topography-16ppd.xml); decoded by `app.js` and `mola_route_planner.py` | **Active route input.** Elevation, local grade, contours, terrain shading, route profile, and traversal weights. |
| Mars weather | [NASA Mars weather API — MSL feed](https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json) | [`data/mars-weather.json`](data/mars-weather.json) | **Context.** Displays the latest available Curiosity/MSL station observation. It is not a spatial dust-front map. |
| Mars surface imagery | [NASA Image and Video Library asset PIA16018](https://images.nasa.gov/details/PIA16018) and [asset file](https://images-assets.nasa.gov/image/PIA16018/PIA16018~orig.jpg) | [`data/curiosity-martian-surface.jpg`](data/curiosity-martian-surface.jpg) | **Visual context.** Primary background image beneath the data overlays. |
| NASA image metadata | [PIA16018 collection metadata](https://images-assets.nasa.gov/image/PIA16018/collection.json) | [`data/curiosity-surface-collection.json`](data/curiosity-surface-collection.json), [`data/curiosity-image-collection.json`](data/curiosity-image-collection.json) | **Provenance.** Preserves the NASA asset metadata used to identify the image. |
| NASA image search | [NASA Image and Video Library search API](https://images-api.nasa.gov/search?q=Curiosity%20rover%20Mars%20surface&media_type=image&page_size=20) | [`data/nasa-curiosity-surface-search.json`](data/nasa-curiosity-surface-search.json), [`data/nasa-mars-imagery-search.json`](data/nasa-mars-imagery-search.json) | **Provenance.** Records the search responses used while selecting surface imagery. |
| HiRISE Gale context | [HiRISE DTM product page](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=PSP_009650_1755) and [official browse derivative](https://hirise-pds.lpl.arizona.edu/PDS/EXTRAS/DTM/PSP/ORB_009600_009699/PSP_009650_1755_PSP_009716_1755/DTEEC_009650_1755_009716_1755_U01.ca.jpg) | [`data/hirise-gale-dtm-color-altimetry.jpg`](data/hirise-gale-dtm-color-altimetry.jpg) | **Context-only.** Shows high-resolution Gale altimetry visually. It is not a registered numeric DTM and does not affect routing. |
| InSight seismic context | [NASA InSight SEIS PDS bundle](https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn:nasa:pds:insight_seis&version=3.0) and [Mars events catalog mirror](https://ds.iris.edu/ds/mars-events/v2/) | [`data/insight-seismic-catalog.json`](data/insight-seismic-catalog.json) | **Context-only.** Events are global Mars context. InSight is in Elysium Planitia, not Gale Crater, so the catalog is not treated as a Mount Sharp-local hazard raster. |

## Official sources represented as planned or context adapters

These sources are documented in the application and are candidates for future
registered layers. They are intentionally not used as route-cost inputs until
their spatial coverage, coordinate reference, processing level, and uncertainty
are handled correctly.

| Science theme | Official source | Status and limitation |
|---|---|---|
| Curiosity localization | [MSL PLACES RDR V1.0](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=MSL-M-ROVER-6-RDR-PLACES-V1.0) | **Planned.** Discrete rover positions and observations require PDS coordinate and map metadata before joining them to route waypoints. |
| Radiation | [MSL RAD RDR collection](https://pds-ppi.igpp.ucla.edu/collection/MSL-M-RAD-3-RDR-V1.0:DATA) | **Planned.** RAD is a time series at the Curiosity location; it is not a measured spatial radiation surface over Mount Sharp. |
| Atmospheric dust and weather | [MSL REMS PDS product](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=MSL-M-REMS-2-EDR-V1.0) and the [Mars Climate Database](http://www-mars.lmd.jussieu.fr/) | **Context-only/planned.** Station and model data need time and location handling; they are not automatically a live local dust hazard map. |
| Chemistry and mineralogy | [NASA PDS Geosciences MSL archive](https://pds-geosciences.wustl.edu/missions/msl/) | **Planned.** APXS, ChemCam, CheMin, SAM, and DAN observations are discrete target measurements, not continuous route rasters. |
| Orbital geology and mineralogy | [CRISM PDS Geosciences archive](https://pds-geosciences.wustl.edu/missions/mro/crism.htm) and [USGS Astrogeology Mars maps](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | **Planned.** Product footprints, map projections, and observation geometry must be preserved before use in route planning. |
| Thermal and infrared context | [NASA Mars Space Flight Facility data portal](https://www.mars.asu.edu/data/) | **Planned.** A product-specific THEMIS extract and map registration are required; no THEMIS raster is currently bundled. |
| Subsurface ice and radar | [SHARAD data through the NASA PDS](https://pds.nasa.gov/) | **Planned.** SHARAD observations have track and footprint geometry; they cannot be treated as a continuous obstacle layer without processing. |

## Challenge and mission-design references

These references informed the product brief, interface, and scientific framing:

- [NASA Space Apps — Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=details)
- [NASA Planetary Data System](https://pds.nasa.gov/)
- [NASA Mars 2020 mission resources](https://mars.nasa.gov/mars2020/)
- [Curiosity proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/)
- [MarsSI planetary mapping interface](https://marssi.univ-lyon1.fr/MarsSI/map/mars/#1/0/0/MOLA)
- [MOLA color and topography resources](https://www.mars.asu.edu/data/mola_color/)
- [USGS/NASA Geologic Map of Mars](https://pubs.usgs.gov/sim/3292/)
- [USGS/NASA interactive Mars maps](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars)

## Processing and derived data

The following are derived locally from the official MOLA product rather than
downloaded as independent NASA products:

- The regional demonstration grid covering approximately `134°E–141°E` and
  `9°S–2°S`.
- Resampling to the approximately `0.12°` visualization grid.
- Four-neighbor maximum local grade:

  `grade_percent = abs(delta_elevation_m) / horizontal_distance_m * 100`

- Normalized traversal weight:

  `traversal_weight = min(1, grade_percent / 35)`

- Great-circle distance using a mean Mars radius of `3389.5 km`.
- Connected four-neighbor A* route, with terrain, distance, and corridor terms.
- MOLA-derived contours, route profile, ascent, and direct-route comparison.

These calculations are described in [`README.md`](README.md) and implemented
in [`app.js`](app.js) and [`mola_route_planner.py`](mola_route_planner.py).
They are derived products and should not be cited as additional measured
datasets.

## Presentation dependencies

The application has no runtime npm dependencies. The interface references the
following Google Fonts for presentation:

- [DM Mono](https://fonts.google.com/specimen/DM+Mono)
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)

If the fonts are unavailable, the browser falls back to local generic font
families. The map and route calculations do not depend on these fonts.

## Attribution and reproducibility

When presenting or sharing the project, cite the original provider alongside
the local file or derived layer. In particular:

1. Credit NASA/JPL/MOLA and the NASA Planetary Data System for the topography.
2. Credit NASA/JPL/University of Arizona for the HiRISE browse context.
3. Credit NASA's Image and Video Library for the surface imagery.
4. Credit NASA MSL and the relevant PDS archives for weather, seismic, and
   planned mission layers.
5. State clearly that the current route is terrain-derived and that the other
   hazard themes are context-only or planned unless a future release adds
   registered numeric products.

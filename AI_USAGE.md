# Aurelia — Generative AI Use and Human Contribution

## Disclosure

Aurelia was developed with generative-AI assistance through GitHub Copilot
using the Copilot SDK in VS Code. AI assistance was used as an engineering
and review tool, not as a substitute for the team's scientific judgment,
creative direction, or responsibility for the submission.

## What the team decided and created

The team owns the mission concept, the choice of Gale Crater and the lower
Mount Sharp foothill demonstrator, the product goals, the user experience,
the route-planning assumptions, and the final interpretation of results. Team
members selected the NASA/PDS sources, reviewed the coordinate bounds and
units, decided which layers were scientifically valid for route costing, and
accepted or rejected implementation changes.

The core demonstrator is an original integration of:

- NASA MGS MOLA topography.
- A Gale-region resampling and terrain-weight derivation.
- A connected four-neighbor A* route planner.
- A mission HUD that explains route trade-offs and data provenance.
- Explicit separation of active, context-only, planned, and unavailable data.

## How generative AI assisted

AI assistance supported the team by:

- Translating the product brief into interface and software tasks.
- Drafting and refining JavaScript and Python implementation scaffolding.
- Helping implement and inspect the MOLA binary decoder, coordinate mapping,
  slope calculation, weight matrix, and A* route logic.
- Checking consistency between the browser implementation and the Python
  notebook handoff.
- Identifying and correcting unit, indexing, endpoint, and unsupported-data
  claims during review.
- Drafting documentation, source citations, provenance records, and
  reproducibility instructions.
- Helping run syntax checks, diff checks, route-model checks, and review
  workflows.

AI did not invent or replace the NASA measurements. The MOLA binary, PDS
label, weather feed, imagery, HiRISE browse product, and seismic catalog are
external scientific products whose provenance is recorded in
[`SOURCES.md`](SOURCES.md), [`data/manifest.json`](data/manifest.json), and
[`data/science-layers.json`](data/science-layers.json).

## Human review and scientific safeguards

The team reviewed the generated implementation and made the consequential
scientific decisions. In particular:

1. Elevation values remain MOLA areoid-relative metres.
2. Slope is derived from elevation difference divided by Mars-surface
   horizontal distance.
3. Terrain difficulty is capped at a documented 35% grade threshold.
4. The route uses connected four-neighbor movement rather than unrelated
   jumps between cells.
5. Radiation, dust, seismic, chemistry, geology, and browse imagery are not
   presented as local route hazards without spatial registration and a
   defensible uncertainty model.
6. The original high northern endpoint was replaced with a lower Mount Sharp
   foothill target after inspecting the sampled MOLA elevations.
7. The team retained the right to reject AI suggestions and treated all
   generated code as subject to testing and review.

## Reproducibility

The active route model can be reproduced from the bundled MOLA product with
the standard-library Python module
[`mola_route_planner.py`](mola_route_planner.py). The browser implementation
is in [`app.js`](app.js). The exact formulas, source products, limitations,
and active-layer decisions are documented in
[`README.md`](README.md) and [`SOURCES.md`](SOURCES.md).

## Submission statement

> Generative AI supported Aurelia's software engineering, documentation, and
> review workflow. The team directed the concept and interaction design,
> selected and verified the NASA data products, made the scientific modeling
> decisions, reviewed the implementation, and is responsible for the final
> code, claims, and results. AI-generated suggestions were treated as
> proposals and were tested, corrected, or rejected by the team.

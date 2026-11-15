"""MOLA terrain-weighted route planner for Jupyter or standalone Python.

Data provenance
---------------
This module consumes the bundled NASA MGS MOLA MEGDR 16 pixels/degree
topography product:

    data/mola/mola-topography-16ppd.img
    data/mola/mola-topography-16ppd.xml

The PDS label defines signed, big-endian 16-bit elevation values in metres,
with 5760 samples by 2880 lines and 0.0625 degrees per source cell. The
planner resamples the Gale demonstration window to 0.12 degrees. Elevation is
relative to the MOLA areoid, not height above the crater floor.

The active route cost is intentionally limited to spatially valid inputs:
MOLA-derived slope and Mars-surface distance. Radiation, dust, seismic,
chemistry, and orbital browse products must not be interpolated into this
cost without a validated geospatial model.
"""

from __future__ import annotations

import argparse
import csv
import heapq
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

MARS_RADIUS_KM = 3389.5
SOURCE_COLS = 5760
SOURCE_ROWS = 2880
SOURCE_PIXELS_PER_DEGREE = 16


@dataclass(frozen=True)
class Point:
    lon: float
    lat: float
    elev: int
    slope_percent: float = 0.0
    traversal_weight: float = 0.0


@dataclass
class Grid:
    points: List[Point]
    cols: int
    rows: int
    lon0: float
    lon1: float
    lat0: float
    lat1: float
    step: float

    def index(self, x: int, y: int) -> int:
        return y * self.cols + x

    def xy(self, index: int) -> Tuple[int, int]:
        return index % self.cols, index // self.cols


def mars_distance_km(a: Point, b: Point) -> float:
    """Great-circle distance on a spherical Mars model."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = math.radians(b.lat - a.lat)
    dlon = math.radians(b.lon - a.lon)
    hav = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 2 * MARS_RADIUS_KM * math.asin(math.sqrt(min(1.0, hav)))


def load_mola_grid(
    image_path: Path,
    lon0: float = 134.0,
    lon1: float = 141.0,
    lat0: float = -9.0,
    lat1: float = -2.0,
    step: float = 0.12,
) -> Grid:
    """Read the official MOLA binary and create a consistently indexed grid."""
    if not image_path.is_file():
        raise FileNotFoundError(f"MOLA image not found: {image_path}")
    expected_bytes = SOURCE_COLS * SOURCE_ROWS * 2
    if image_path.stat().st_size < expected_bytes:
        raise ValueError(f"MOLA image is incomplete: {image_path.stat().st_size} bytes")

    cols = math.floor((lon1 - lon0) / step) + 1
    rows = math.floor((lat1 - lat0) / step) + 1

    def sample(data: bytes, lat: float, lon: float) -> int:
        row = max(0, min(SOURCE_ROWS - 1, round((90.0 - lat) * SOURCE_PIXELS_PER_DEGREE)))
        col = max(0, min(SOURCE_COLS - 1, round(lon * SOURCE_PIXELS_PER_DEGREE)))
        offset = (row * SOURCE_COLS + col) * 2
        return struct.unpack_from(">h", data, offset)[0]

    data = image_path.read_bytes()
    points: List[Point] = []
    for y in range(rows):
        for x in range(cols):
            lat = lat0 + y * step
            lon = lon0 + x * step
            points.append(Point(lon=lon, lat=lat, elev=sample(data, lat, lon)))

    grid = Grid(
        points=points,
        cols=cols,
        rows=rows,
        lon0=lon0,
        lon1=lon0 + (cols - 1) * step,
        lat0=lat0,
        lat1=lat0 + (rows - 1) * step,
        step=step,
    )
    if len(points) != cols * rows:
        raise AssertionError("MOLA grid indexing invariant failed")
    return grid


def build_weight_matrix(grid: Grid, slope_cap_percent: float = 35.0) -> List[float]:
    """Return one normalized traversal weight per grid cell.

    The cell grade is the maximum four-neighbor rise/run grade:
        grade_percent = abs(delta_elevation_m) / horizontal_distance_m * 100
    A weight of 0 is easy terrain and 1 is at or above slope_cap_percent.
    """
    weights = [0.0] * len(grid.points)
    for y in range(grid.rows):
        for x in range(grid.cols):
            index = grid.index(x, y)
            point = grid.points[index]
            max_grade = 0.0
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < grid.cols and 0 <= ny < grid.rows:
                    neighbor = grid.points[grid.index(nx, ny)]
                    run_m = mars_distance_km(point, neighbor) * 1000.0
                    if run_m:
                        max_grade = max(
                            max_grade,
                            abs(neighbor.elev - point.elev) / run_m * 100.0,
                        )
            weight = min(1.0, max_grade / slope_cap_percent)
            grid.points[index] = Point(
                point.lon, point.lat, point.elev, max_grade, weight
            )
            weights[index] = weight
    return weights


def corridor_distance_km(point: Point, start: Point, goal: Point) -> float:
    """Perpendicular distance to the start-goal line in a local tangent plane."""
    mean_lat = math.radians((start.lat + goal.lat) / 2.0)

    def project(p: Point) -> Tuple[float, float]:
        return (
            math.radians(p.lon) * math.cos(mean_lat) * MARS_RADIUS_KM,
            math.radians(p.lat) * MARS_RADIUS_KM,
        )

    px, py = project(point)
    ax, ay = project(start)
    bx, by = project(goal)
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    if not length_squared:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_squared))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def nearest_index(grid: Grid, target_lon: float, target_lat: float) -> int:
    return min(
        range(len(grid.points)),
        key=lambda i: (grid.points[i].lon - target_lon) ** 2
        + (grid.points[i].lat - target_lat) ** 2,
    )


def plan_route(
    grid: Grid,
    start_lon: float = 137.25,
    start_lat: float = -5.65,
    goal_lon: float = 137.85,
    goal_lat: float = -5.08,
    terrain_weight: float = 30.0,
    distance_weight: float = 10.0,
) -> Tuple[List[Point], float]:
    """Run connected 4-neighbor A* and return (route, cumulative_cost)."""
    if not any(point.traversal_weight for point in grid.points):
        build_weight_matrix(grid)
    start = grid.points[nearest_index(grid, start_lon, start_lat)]
    goal_index = nearest_index(grid, goal_lon, goal_lat)
    start_index = nearest_index(grid, start_lon, start_lat)
    total_weight = terrain_weight + distance_weight or 1.0
    terrain = terrain_weight / total_weight
    distance = distance_weight / total_weight

    open_heap = [(0.0, start_index)]
    came_from: Dict[int, int] = {}
    costs = {start_index: 0.0}

    def heuristic(index: int) -> float:
        return mars_distance_km(grid.points[index], grid.points[goal_index]) * (1 + distance)

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current == goal_index:
            break
        x, y = grid.xy(current)
        here = grid.points[current]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= nx < grid.cols and 0 <= ny < grid.rows):
                continue
            next_index = grid.index(nx, ny)
            next_point = grid.points[next_index]
            if not (
                min(start.lon, goal_lon) - 0.35
                <= next_point.lon
                <= max(start.lon, goal_lon) + 0.35
                and min(start.lat, goal_lat) - 0.35
                <= next_point.lat
                <= max(start.lat, goal_lat) + 0.35
            ):
                continue
            step_km = mars_distance_km(here, next_point)
            multiplier = 1 + terrain * next_point.traversal_weight * 8 + distance
            candidate = (
                costs[current]
                + step_km * multiplier
                + corridor_distance_km(next_point, start, grid.points[goal_index]) * 0.05
            )
            if candidate < costs.get(next_index, math.inf):
                came_from[next_index] = current
                costs[next_index] = candidate
                heapq.heappush(open_heap, (candidate + heuristic(next_index), next_index))

    if goal_index not in costs:
        return [], math.inf
    route_indices = [goal_index]
    while route_indices[-1] != start_index:
        route_indices.append(came_from[route_indices[-1]])
    route_indices.reverse()
    return [grid.points[i] for i in route_indices], costs[goal_index]


def export_route(route: Sequence[Point], cost: float, output_path: Path) -> None:
    """Export a notebook-friendly JSON route artifact."""
    payload = {
        "source": "NASA MGS MOLA MEGDR 16 ppd, resampled 0.12 degrees",
        "elevation_reference": "MOLA areoid-relative metres",
        "mars_radius_km": MARS_RADIUS_KM,
        "cost": cost,
        "points": [point.__dict__ for point in route],
    }
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mola", type=Path, default=Path("data/mola/mola-topography-16ppd.img"))
    parser.add_argument("--output", type=Path, default=Path("mola-route.json"))
    parser.add_argument("--terrain-weight", type=float, default=30.0)
    parser.add_argument("--distance-weight", type=float, default=10.0)
    args = parser.parse_args()
    grid = load_mola_grid(args.mola)
    build_weight_matrix(grid)
    route, cost = plan_route(
        grid,
        terrain_weight=args.terrain_weight,
        distance_weight=args.distance_weight,
    )
    if not route:
        raise RuntimeError("No connected route found in the configured corridor")
    export_route(route, cost, args.output)
    print(f"Grid: {grid.cols} x {grid.rows}; route points: {len(route)}")
    print(f"Route cost: {cost:.3f}; output: {args.output}")


if __name__ == "__main__":
    main()

/**
 * Geometry of /public/world-map-dots.svg: a dotted land map in a plain
 * latitude/longitude (equirectangular) projection, cropped to these bounds.
 *
 * Anything placed over the map must use projectToWorldMap so it lines up with
 * the dots. The image was generated once from Natural Earth land data; if it is
 * ever regenerated, it has to use the same bounds.
 */
export const WORLD_MAP_BOUNDS = {
  lonMin: -180,
  lonMax: 180,
  latMin: -58,
  latMax: 84,
} as const;

/** Width divided by height of the map image. */
export const WORLD_MAP_ASPECT_RATIO =
  (WORLD_MAP_BOUNDS.lonMax - WORLD_MAP_BOUNDS.lonMin) /
  (WORLD_MAP_BOUNDS.latMax - WORLD_MAP_BOUNDS.latMin);

/** Position of a coordinate on the map, as percentages from its top-left. */
export function projectToWorldMap(
  lat: number,
  lon: number,
): { x: number; y: number } {
  const { lonMin, lonMax, latMin, latMax } = WORLD_MAP_BOUNDS;
  return {
    x: ((lon - lonMin) / (lonMax - lonMin)) * 100,
    y: ((latMax - lat) / (latMax - latMin)) * 100,
  };
}

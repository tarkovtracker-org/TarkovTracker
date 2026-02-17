export type MapCoordinatePair = [number, number];
export interface MapCoordinatePoint {
  x: number;
  z: number;
}
export type MapBoundsArray = [MapCoordinatePair, MapCoordinatePair];
export type CoordinateRotation = number | null;
export interface MapSvgProp {
  bounds?: MapBoundsArray;
  coordinateRotation?: CoordinateRotation;
}
export interface MapProp {
  name?: string;
  svg?: string | MapSvgProp;
}
export interface MapUserMark {
  id?: string;
  users?: string[];
}
export type MarkProp = MapUserMark;
export interface MarkLocationProp {
  positions?: MapCoordinatePoint[];
}
export type ZoneMark = MapUserMark;
export interface ZoneLocation {
  outline: MapCoordinatePoint[];
}

export interface Coordinate {
  lat: number
  lng: number
}

export interface Polygon {
  coordinates: Coordinate[][]
  area: number // in square meters
  bounds: {
    north: number
    south: number
    east: number
    west: number
  }
}

export interface DroneSpecs {
  sensor: {
    width: number // mm
    height: number // mm
  }
  focalLength: number // mm
  imageDimensions: {
    width: number // pixels
    height: number // pixels
  }
  minPhotoInterval: number // seconds
  usableBatteryTime: number // minutes
}

export interface MissionParameters {
  gsd: number // cm/px
  frontOverlap: number // percentage
  sideOverlap: number // percentage
  droneSpeed: number // m/s
  maxBatteryTime: number // minutes
  manualHeading?: boolean // whether to use manual heading override
  customHeading?: number // degrees (0-359), only used when manualHeading is true
  customTurnRadius?: number // meters, optional override for turn radius calculation
}

export interface MissionData {
  polygon: Polygon
  parameters: MissionParameters
  droneSpecs: DroneSpecs
  calculatedAltitude: number // AGL in meters
}

export interface FlightLine {
  id: string
  coordinates: Coordinate[]
  heading: number // degrees
  length: number // meters
  missionIndex: number
  lineIndex: number // original index in generated sequence
}

export type PathSegmentKind = 'line' | 'connector'

export interface PathSegment {
  kind: PathSegmentKind
  coordinates: Coordinate[]
  missionIndex: number
  segmentIndex: number
  color: string
}

export interface Mission {
  id: string
  index: number
  flightLines: FlightLine[]
  estimatedTime: number // minutes
  estimatedPhotos: number
  color: string
  areaPolygon?: Coordinate[] // optional mission area polygon ring
  startPoint?: Coordinate // optional visual cue for mission start
  endPoint?: Coordinate // optional visual cue for mission end
  pathSegments?: PathSegment[] // ordered path with connectors for rendering/export
}

export interface FlightPlan {
  missions: Mission[]
  totalTime: number // minutes
  totalPhotos: number
  totalArea: number // acres
  batteryCount: number
  optimalHeading: number // degrees
}

export interface KMLData {
  name?: string
  description?: string
  coordinates: Coordinate[]
} 
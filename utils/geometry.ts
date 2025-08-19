import { Coordinate, Polygon } from '@/types/mission'

// Calculate the area of a polygon using the shoelace formula
export function calculatePolygonArea(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) return 0
  
  let area = 0
  const n = coordinates.length
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += coordinates[i].lng * coordinates[j].lat
    area -= coordinates[j].lng * coordinates[i].lat
  }
  
  // Convert to square meters (approximate)
  // 1 degree ≈ 111,000 meters at the equator
  const metersPerDegree = 111000
  return Math.abs(area) * 0.5 * metersPerDegree * metersPerDegree
}

// Calculate the bounding box of a polygon
export function calculateBounds(coordinates: Coordinate[]): {
  north: number
  south: number
  east: number
  west: number
} {
  if (coordinates.length === 0) {
    return { north: 0, south: 0, east: 0, west: 0 }
  }
  
  let north = coordinates[0].lat
  let south = coordinates[0].lat
  let east = coordinates[0].lng
  let west = coordinates[0].lng
  
  for (const coord of coordinates) {
    north = Math.max(north, coord.lat)
    south = Math.min(south, coord.lat)
    east = Math.max(east, coord.lng)
    west = Math.min(west, coord.lng)
  }
  
  return { north, south, east, west }
}

// Calculate the optimal flight heading to minimize turns
export function calculateOptimalHeading(polygon: Polygon): number {
  const { north, south, east, west } = polygon.bounds
  
  const width = east - west
  const height = north - south
  
  // If the polygon is wider than tall, fly north-south
  // If the polygon is taller than wide, fly east-west
  if (width > height) {
    return 0 // North
  } else {
    return 90 // East
  }
}

// Calculate the distance between two coordinates in meters
export function calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
  return R * c
}

// Calculate the bearing between two coordinates
export function calculateBearing(coord1: Coordinate, coord2: Coordinate): number {
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180
  const lat1 = coord1.lat * Math.PI / 180
  const lat2 = coord2.lat * Math.PI / 180
  
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI
  
  // Convert to 0-360 range
  bearing = (bearing + 360) % 360
  
  return bearing
}

// Calculate the line spacing based on GSD and overlap
export function calculateLineSpacing(
  gsd: number,
  imageWidthPx: number,
  sideOverlap: number
): number {
  // Convert GSD from cm/px to m/px
  const gsdMeters = gsd / 100
  
  // Ground footprint width per image (meters)
  const footprintWidthMeters = gsdMeters * imageWidthPx
  
  // Calculate line spacing based on overlap
  const lineSpacing = footprintWidthMeters * (1 - sideOverlap / 100)
  
  return lineSpacing
}

// Calculate the photo interval distance based on GSD and overlap
export function calculatePhotoInterval(
  gsd: number,
  imageHeightPx: number,
  frontOverlap: number
): number {
  // Convert GSD from cm/px to m/px
  const gsdMeters = gsd / 100
  
  // Ground footprint height per image (meters)
  const footprintHeightMeters = gsdMeters * imageHeightPx
  
  // Calculate photo interval based on overlap
  const photoInterval = footprintHeightMeters * (1 - frontOverlap / 100)
  
  return photoInterval
}

// Cohen–Sutherland region codes
const INSIDE = 0; // 0000
const LEFT = 1;   // 0001
const RIGHT = 2;  // 0010
const BOTTOM = 4; // 0100
const TOP = 8;    // 1000

function computeOutCode(x: number, y: number, west: number, east: number, south: number, north: number): number {
  let code = INSIDE
  if (x < west) code |= LEFT
  else if (x > east) code |= RIGHT
  if (y < south) code |= BOTTOM
  else if (y > north) code |= TOP
  return code
}

function cohenSutherlandClip(
  start: Coordinate,
  end: Coordinate,
  bounds: { west: number; east: number; south: number; north: number }
): { start: Coordinate; end: Coordinate } | null {
  let x0 = start.lng
  let y0 = start.lat
  let x1 = end.lng
  let y1 = end.lat
  const { west, east, south, north } = bounds

  let outcode0 = computeOutCode(x0, y0, west, east, south, north)
  let outcode1 = computeOutCode(x1, y1, west, east, south, north)

  let accept = false

  while (true) {
    if ((outcode0 | outcode1) === 0) {
      accept = true
      break
    } else if ((outcode0 & outcode1) !== 0) {
      break
    } else {
      const outcodeOut = outcode0 ? outcode0 : outcode1
      let x = 0
      let y = 0

      const dx = x1 - x0
      const dy = y1 - y0

      if (outcodeOut & TOP) {
        x = x0 + dx * (north - y0) / dy
        y = north
      } else if (outcodeOut & BOTTOM) {
        x = x0 + dx * (south - y0) / dy
        y = south
      } else if (outcodeOut & RIGHT) {
        y = y0 + dy * (east - x0) / dx
        x = east
      } else if (outcodeOut & LEFT) {
        y = y0 + dy * (west - x0) / dx
        x = west
      }

      if (outcodeOut === outcode0) {
        x0 = x
        y0 = y
        outcode0 = computeOutCode(x0, y0, west, east, south, north)
      } else {
        x1 = x
        y1 = y
        outcode1 = computeOutCode(x1, y1, west, east, south, north)
      }
    }
  }

  if (!accept) return null
  return { start: { lat: y0, lng: x0 }, end: { lat: y1, lng: x1 } }
}

// Ray casting for a single ring (lng/lat order)
function isPointInRing(pt: Coordinate, ring: Coordinate[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng, yi = ring[i].lat
    const xj = ring[j].lng, yj = ring[j].lat
    const intersect = ((yi > pt.lat) !== (yj > pt.lat)) &&
      (pt.lng < (xj - xi) * (pt.lat - yi) / ((yj - yi) || 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function isPointInPolygonRings(pt: Coordinate, rings: Coordinate[][]): boolean {
  if (rings.length === 0) return false
  const inOuter = isPointInRing(pt, rings[0])
  if (!inOuter) return false
  // Holes: if inside any inner ring, then outside overall
  for (let r = 1; r < rings.length; r++) {
    if (isPointInRing(pt, rings[r])) return false
  }
  return true
}

// Generate parallel flight lines within a polygon
export function generateFlightLines(
  polygon: Polygon,
  heading: number,
  lineSpacing: number
): Coordinate[][] {
  const { north, south, east, west } = polygon.bounds
  
  console.log('Flight line generation debug:', {
    bounds: { north, south, east, west },
    heading,
    lineSpacing,
    polygonArea: polygon.area
  })
  
  // Calculate the perpendicular direction
  const perpHeading = (heading + 90) % 360
  
  // Calculate the coverage width needed (perpendicular to flight direction)
  const eastWestWidth = calculateDistance({ lat: north, lng: west }, { lat: north, lng: east })
  const northSouthWidth = calculateDistance({ lat: north, lng: west }, { lat: south, lng: west })
  
  // For different headings, the perpendicular coverage width changes
  let coverageWidth: number
  if (heading === 0 || heading === 180) {
    // Flying north-south → coverage width is east-west
    coverageWidth = eastWestWidth
  } else {
    // Flying east-west → coverage width is north-south
    coverageWidth = northSouthWidth
  }
  
  console.log('Coverage width calculation:', {
    heading,
    eastWestWidth,
    northSouthWidth,
    selectedCoverageWidth: coverageWidth
  })
  
  console.log('Coverage calculations:', {
    coverageWidth,
    perpHeading
  })
  
  // Handle narrow areas where line spacing might be larger than coverage width
  if (lineSpacing >= coverageWidth) {
    console.warn(`Line spacing (${lineSpacing.toFixed(1)}m) is larger than coverage width (${coverageWidth.toFixed(1)}m). Using single center line.`)
    
    // For very narrow areas, use a single center line
    const adjustedLineSpacing = lineSpacing
    const numLines = 1
    
    console.log('Narrow area - single line approach:', {
      lineSpacing,
      adjustedLineSpacing,
      numLines,
      coverageWidth
    })
    
    return generateSingleCenterLine(polygon, heading)
  }
  
  // Ensure lineSpacing is reasonable to prevent excessive lines
  // For very small GSD values, cap the minimum line spacing to prevent impractical flight plans
  const minLineSpacing = Math.max(1, coverageWidth / 50) // At most 50 lines across the area
  const adjustedLineSpacing = Math.max(lineSpacing, minLineSpacing)
  
  let numLines = Math.ceil(coverageWidth / adjustedLineSpacing) + 1
  
  // Dynamic safeguard: allow up to 1000 lines, otherwise warn and cap
  const requiredLines = numLines
  const maxLines = 1000
  if (numLines > maxLines) {
    console.warn(`Capping flight lines to ${maxLines} (required: ${requiredLines}). Consider increasing GSD or reducing overlap.`)
    numLines = maxLines
  }
  
  // Use an effective spacing so that outermost lines fall within the AOI width
  const effectiveSpacing = numLines > 1 ? (coverageWidth / (numLines - 1)) : coverageWidth
  
  console.log('Line generation parameters:', {
    minLineSpacing,
    adjustedLineSpacing,
    numLines,
    effectiveSpacing
  })
  
  const flightLines: Coordinate[][] = []
  
  for (let i = 0; i < numLines; i++) {
    // Calculate offset from center using effective spacing to ensure coverage to both edges
    const offset = (i - (numLines - 1) / 2) * effectiveSpacing
    
    // Calculate center point of the polygon
    const centerPoint = { 
      lat: (north + south) / 2, 
      lng: (east + west) / 2 
    }
    
    // Calculate the mid point for this line (offset perpendicular from center)
    const midPoint = calculateOffsetPoint(
      centerPoint,
      perpHeading,
      offset
    )
    
    // Calculate the base line length needed to cover the polygon in the flight direction
    let baseLineLengthMeters: number
    if (heading === 0 || heading === 180) {
      // Flying north-south → need to cover north-south distance
      baseLineLengthMeters = calculateDistance({ lat: north, lng: west }, { lat: south, lng: west })
    } else {
      // Flying east-west → need to cover east-west distance
      baseLineLengthMeters = calculateDistance({ lat: north, lng: west }, { lat: north, lng: east })
    }
    
    // Add buffer to ensure complete coverage beyond the polygon bounds
    const lineLengthMeters = baseLineLengthMeters + coverageWidth * 0.2 // 20% buffer
    const halfLength = lineLengthMeters / 2
    
    // Create a symmetric line around the midPoint along the heading
    const rawStart = calculateOffsetPoint(midPoint, (heading + 180) % 360, halfLength)
    const rawEnd = calculateOffsetPoint(midPoint, heading, halfLength)

    // Clip the raw line to AOI bounds to guarantee coverage inside the rectangle
    const clipped = cohenSutherlandClip(rawStart, rawEnd, { west, east, south, north })
    if (!clipped) {
      continue
    }

    const startPoint = clipped.start
    const endPoint = clipped.end
    
    if (i === 0) {
      console.log('First flight line details:', {
        centerPoint,
        midPoint,
        startPoint,
        endPoint,
        baseLineLengthMeters,
        lineLengthMeters,
        offset
      })
    }
    
    // Generate waypoints along the line with denser spacing for better coverage
    const waypointSpacing = Math.min(adjustedLineSpacing, 5) // Max 5m between waypoints
    const waypoints = generateWaypointsAlongLine(startPoint, endPoint, waypointSpacing)
    
    // Strictly clip to AOI polygon: split into interior segments using point-in-polygon
    const rings = polygon.coordinates
    const segments: Coordinate[][] = []
    let current: Coordinate[] = []
    for (let w = 0; w < waypoints.length; w++) {
      const wp = waypoints[w]
      const inside = isPointInPolygonRings(wp, rings)
      if (inside) {
        current.push(wp)
      } else {
        if (current.length > 1) segments.push(current)
        current = []
      }
    }
    if (current.length > 1) segments.push(current)
    
    if (i === 0) {
      console.log('First line waypoint stats:', {
        totalWaypoints: waypoints.length,
        interiorSegments: segments.length,
        waypointSpacing
      })
    }
    
    // Add interior segments as individual flight lines
    for (const seg of segments) {
      if (seg.length > 1) flightLines.push(seg)
    }
  }
  
  console.log('Flight line generation complete:', {
    totalLines: flightLines.length,
    expectedLines: numLines
  })
  
  return flightLines
}

// Generate a single center line for very narrow areas
function generateSingleCenterLine(polygon: Polygon, heading: number): Coordinate[][] {
  const { north, south, east, west } = polygon.bounds
  
  // Calculate center point of the polygon
  const centerPoint = { 
    lat: (north + south) / 2, 
    lng: (east + west) / 2 
  }
  
  // Calculate the line length needed to cover the polygon in the flight direction
  let lineLengthMeters: number
  if (heading === 0 || heading === 180) {
    // Flying north-south → need to cover north-south distance
    lineLengthMeters = calculateDistance({ lat: north, lng: west }, { lat: south, lng: west })
  } else {
    // Flying east-west → need to cover east-west distance
    lineLengthMeters = calculateDistance({ lat: north, lng: west }, { lat: north, lng: east })
  }
  
  // Add 20% buffer
  const bufferedLength = lineLengthMeters * 1.2
  const halfLength = bufferedLength / 2
  
  // Create a line through the center
  const start = calculateOffsetPoint(centerPoint, (heading + 180) % 360, halfLength)
  const end = calculateOffsetPoint(centerPoint, heading, halfLength)
  
  // Generate waypoints along the line
  const waypointSpacing = Math.min(5, lineLengthMeters / 10) // Max 5m spacing
  const waypoints = generateWaypointsAlongLine(start, end, waypointSpacing)
  
  // Filter waypoints that are inside the polygon
  const rings = polygon.coordinates
  const interiorWaypoints = waypoints.filter(wp => isPointInPolygonRings(wp, rings))
  
  console.log('Single center line generated:', {
    totalWaypoints: waypoints.length,
    interiorWaypoints: interiorWaypoints.length,
    lineLengthMeters,
    heading
  })
  
  // Return the center line if it has enough waypoints
  if (interiorWaypoints.length >= 2) {
    return [interiorWaypoints]
  } else {
    console.warn('Single center line has insufficient waypoints inside polygon')
    return []
  }
}

// Generate parallel flight lines strictly within an area and additionally clipped by a master AOI
export function generateFlightLinesClippedByAOI(
  area: Polygon,
  masterAOI: Polygon,
  heading: number,
  lineSpacing: number
): Coordinate[][] {
  // Reuse generateFlightLines internals but replace the interior test with (area AND masterAOI)
  const { north, south, east, west } = area.bounds

  const perpHeading = (heading + 90) % 360

  const coverageWidth = Math.max(
    calculateDistance({ lat: north, lng: west }, { lat: north, lng: east }),
    calculateDistance({ lat: north, lng: west }, { lat: south, lng: west })
  )

  const minLineSpacing = Math.max(1, coverageWidth / 50)
  const adjustedLineSpacing = Math.max(lineSpacing, minLineSpacing)

  let numLines = Math.ceil(coverageWidth / adjustedLineSpacing) + 1
  const maxLines = 50
  if (numLines > maxLines) numLines = maxLines

  const flightLines: Coordinate[][] = []

  for (let i = 0; i < numLines; i++) {
    const offset = (i - (numLines - 1) / 2) * (coverageWidth / Math.max(1, numLines - 1))

    const centerPoint = { lat: (north + south) / 2, lng: (east + west) / 2 }
    const midPoint = calculateOffsetPoint(centerPoint, perpHeading, offset)

    let baseLineLengthMeters: number
    if (heading === 0 || heading === 180) {
      baseLineLengthMeters = calculateDistance({ lat: north, lng: west }, { lat: south, lng: west })
    } else {
      baseLineLengthMeters = calculateDistance({ lat: north, lng: west }, { lat: north, lng: east })
    }

    const lineLengthMeters = baseLineLengthMeters + coverageWidth * 0.2
    const halfLength = lineLengthMeters / 2

    const rawStart = calculateOffsetPoint(midPoint, (heading + 180) % 360, halfLength)
    const rawEnd = calculateOffsetPoint(midPoint, heading, halfLength)

    const clipped = cohenSutherlandClip(rawStart, rawEnd, area.bounds)
    if (!clipped) continue

    const startPoint = clipped.start
    const endPoint = clipped.end

    const waypointSpacing = Math.min(adjustedLineSpacing, 5)
    const waypoints = generateWaypointsAlongLine(startPoint, endPoint, waypointSpacing)

    const areaRings = area.coordinates
    const masterRings = masterAOI.coordinates

    const segments: Coordinate[][] = []
    let current: Coordinate[] = []
    for (let w = 0; w < waypoints.length; w++) {
      const wp = waypoints[w]
      const insideArea = isPointInPolygonRings(wp, areaRings)
      const insideMaster = isPointInPolygonRings(wp, masterRings)
      const inside = insideArea && insideMaster
      if (inside) {
        current.push(wp)
      } else {
        if (current.length > 1) segments.push(current)
        current = []
      }
    }
    if (current.length > 1) segments.push(current)

    for (const seg of segments) {
      if (seg.length > 1) flightLines.push(seg)
    }
  }

  return flightLines
}

// Calculate a point offset from a given point by distance and bearing
function calculateOffsetPoint(
  point: Coordinate,
  bearing: number,
  distance: number
): Coordinate {
  const R = 6371000 // Earth's radius in meters
  const lat1 = point.lat * Math.PI / 180
  const lng1 = point.lng * Math.PI / 180
  const brng = bearing * Math.PI / 180
  
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance / R) +
    Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng)
  )
  
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
    Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
  )
  
  return {
    lat: lat2 * 180 / Math.PI,
    lng: lng2 * 180 / Math.PI
  }
}

// Generate waypoints along a line
function generateWaypointsAlongLine(
  start: Coordinate,
  end: Coordinate,
  spacing: number
): Coordinate[] {
  const distance = calculateDistance(start, end)
  const numWaypoints = Math.ceil(distance / spacing) + 1
  
  const waypoints: Coordinate[] = []
  
  for (let i = 0; i < numWaypoints; i++) {
    const ratio = i / (numWaypoints - 1)
    const lat = start.lat + (end.lat - start.lat) * ratio
    const lng = start.lng + (end.lng - start.lng) * ratio
    
    waypoints.push({ lat, lng })
  }
  
  return waypoints
}

// Calculate optimal turn radius based on drone speed and banking angle
export function calculateTurnRadius(droneSpeed: number, bankingAngle: number = 25): number {
  // Standard turn radius formula: R = V² / (g * tan(θ))
  // where V = velocity, g = gravity (9.81 m/s²), θ = banking angle
  const g = 9.81 // gravity in m/s²
  const bankingRadians = (bankingAngle * Math.PI) / 180
  
  const turnRadius = Math.pow(droneSpeed, 2) / (g * Math.tan(bankingRadians))
  
  // Apply safety margin and constraints for different drone types
  const minRadius = Math.max(turnRadius * 1.2, 5) // Minimum 5m radius with 20% safety margin
  const maxRadius = Math.min(minRadius, 50) // Maximum 50m to prevent excessively wide turns
  
  return maxRadius
}

// Generate optimized turn waypoints between two flight lines
export function generateOptimizedTurn(
  line1End: Coordinate,
  line2Start: Coordinate,
  line1Heading: number,
  line2Heading: number,
  turnRadius: number,
  polygon: Polygon
): Coordinate[] {
  // Calculate the turn angle
  let turnAngle = line2Heading - line1Heading
  
  // Normalize to [-180, 180]
  while (turnAngle > 180) turnAngle -= 360
  while (turnAngle < -180) turnAngle += 360
  
  // If it's a small turn (< 30°), use straight connection
  if (Math.abs(turnAngle) < 30) {
    return [line1End, line2Start]
  }
  
  // For 180° turns (U-turns), create optimized arc
  if (Math.abs(turnAngle) > 150) {
    return generateUTurn(line1End, line2Start, turnRadius, line1Heading, polygon)
  }
  
  // For other turns, create smooth arc
  return generateSmoothTurn(line1End, line2Start, turnRadius, line1Heading, line2Heading, polygon)
}

// Generate U-turn waypoints that stay within polygon bounds
function generateUTurn(
  startPoint: Coordinate,
  endPoint: Coordinate,
  turnRadius: number,
  heading: number,
  polygon: Polygon
): Coordinate[] {
  const waypoints: Coordinate[] = [startPoint]
  
  // Calculate perpendicular direction for the turn
  const perpHeading = (heading + 90) % 360
  
  // Determine turn direction based on which side keeps us more inside the polygon
  const leftTurnCenter = calculateOffsetPoint(startPoint, perpHeading, turnRadius)
  const rightTurnCenter = calculateOffsetPoint(startPoint, (perpHeading + 180) % 360, turnRadius)
  
  // Choose the turn center that keeps us more inside the polygon
  const leftInside = isPointInPolygonRings(leftTurnCenter, polygon.coordinates)
  const rightInside = isPointInPolygonRings(rightTurnCenter, polygon.coordinates)
  
  let turnCenter: Coordinate
  let turnDirection: number // 1 for left, -1 for right
  
  if (leftInside && !rightInside) {
    turnCenter = leftTurnCenter
    turnDirection = 1
  } else if (rightInside && !leftInside) {
    turnCenter = rightTurnCenter
    turnDirection = -1
  } else {
    // If both or neither are inside, choose the shorter path
    const leftDistance = calculateDistance(leftTurnCenter, endPoint)
    const rightDistance = calculateDistance(rightTurnCenter, endPoint)
    
    if (leftDistance < rightDistance) {
      turnCenter = leftTurnCenter
      turnDirection = 1
    } else {
      turnCenter = rightTurnCenter
      turnDirection = -1
    }
  }
  
  // Generate arc waypoints (semicircle)
  const numArcPoints = Math.max(6, Math.floor((Math.PI * turnRadius) / 10)) // One point per ~10m of arc
  
  for (let i = 1; i <= numArcPoints; i++) {
    const angle = (i / numArcPoints) * Math.PI * turnDirection // Half circle
    const arcHeading = heading + (angle * 180 / Math.PI)
    const arcPoint = calculateOffsetPoint(turnCenter, arcHeading, turnRadius)
    
    // Only add points that are inside the polygon
    if (isPointInPolygonRings(arcPoint, polygon.coordinates)) {
      waypoints.push(arcPoint)
    }
  }
  
  waypoints.push(endPoint)
  return waypoints
}

// Generate smooth turn for non-U-turn scenarios
function generateSmoothTurn(
  startPoint: Coordinate,
  endPoint: Coordinate,
  turnRadius: number,
  startHeading: number,
  endHeading: number,
  polygon: Polygon
): Coordinate[] {
  const waypoints: Coordinate[] = [startPoint]
  
  // For non-U-turns, use a simple curved path with 3-5 intermediate points
  const numPoints = 3
  const directDistance = calculateDistance(startPoint, endPoint)
  
  // If points are very close, just connect directly
  if (directDistance < turnRadius) {
    waypoints.push(endPoint)
    return waypoints
  }
  
  // Create curved path by offsetting intermediate points
  for (let i = 1; i < numPoints; i++) {
    const ratio = i / numPoints
    
    // Linear interpolation between start and end
    const linearPoint: Coordinate = {
      lat: startPoint.lat + (endPoint.lat - startPoint.lat) * ratio,
      lng: startPoint.lng + (endPoint.lng - startPoint.lng) * ratio
    }
    
    // Add slight curve offset
    const curveOffset = Math.sin(ratio * Math.PI) * (turnRadius * 0.3)
    const perpHeading = (startHeading + 90) % 360
    const curvedPoint = calculateOffsetPoint(linearPoint, perpHeading, curveOffset)
    
    // Only add if inside polygon
    if (isPointInPolygonRings(curvedPoint, polygon.coordinates)) {
      waypoints.push(curvedPoint)
    } else {
      // Fall back to linear point if curved point is outside
      waypoints.push(linearPoint)
    }
  }
  
  waypoints.push(endPoint)
  return waypoints
} 
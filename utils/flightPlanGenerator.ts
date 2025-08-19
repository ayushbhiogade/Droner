import { MissionData, FlightPlan, Mission, FlightLine, Coordinate, Polygon } from '@/types/mission'
import { 
  calculateOptimalHeading, 
  calculateLineSpacing, 
  calculatePhotoInterval,
  generateFlightLines,
  calculateDistance, 
  generateFlightLinesClippedByAOI,
  calculateTurnRadius,
  generateOptimizedTurn
} from './geometry'

export function generateFlightPlan(missionData: MissionData): FlightPlan {
  // Determine candidate headings based on manual override setting
  const candidateHeadings = missionData.parameters.manualHeading && missionData.parameters.customHeading !== undefined
    ? [missionData.parameters.customHeading] // Use only the manual heading
    : [0, 90] // Evaluate both principal headings and pick the better
    
  console.log('🧭 Heading Selection:', {
    manualMode: missionData.parameters.manualHeading,
    customHeading: missionData.parameters.customHeading,
    candidateHeadings
  })
  
  // Validate GSD parameter - should be reasonable (0.5cm to 50cm)
  if (missionData.parameters.gsd > 5000) {
    console.error(`GSD value ${missionData.parameters.gsd}cm is extremely high and unrealistic. Expected range: 0.5-50cm.`)
    throw new Error(`GSD value ${missionData.parameters.gsd}cm is too high. Please use a value between 0.5 and 50cm.`)
  }
  
  if (missionData.parameters.gsd < 0.5) {
    console.error(`GSD value ${missionData.parameters.gsd}cm is extremely low and unrealistic. Expected range: 0.5-50cm.`)
    throw new Error(`GSD value ${missionData.parameters.gsd}cm is too low. Please use a value between 0.5 and 50cm.`)
  }
  
  // Calculate line spacing based on GSD and overlap
  const lineSpacing = calculateLineSpacing(
    missionData.parameters.gsd,
    missionData.droneSpecs.imageDimensions.width,
    missionData.parameters.sideOverlap
  )
  
  // Calculate photo interval based on GSD and overlap
  const photoInterval = calculatePhotoInterval(
    missionData.parameters.gsd,
    missionData.droneSpecs.imageDimensions.height,
    missionData.parameters.frontOverlap
  )
  
  // Validate parameters to prevent impractical flight plans
  if (lineSpacing < 0.5) {
    console.warn(`Very small line spacing (${lineSpacing.toFixed(2)}m) detected. This may result in an impractical number of flight lines. Consider increasing GSD or reducing overlap.`)
  }
  
  if (photoInterval < 0.5) {
    console.warn(`Very small photo interval (${photoInterval.toFixed(2)}m) detected. This may result in excessive photo count. Consider increasing GSD or reducing overlap.`)
  }
  
  // Altitude calculations verified and consistent
  
  console.log('Flight plan generation parameters:', {
    gsd: missionData.parameters.gsd,
    lineSpacing,
    photoInterval,
    calculatedAltitude: missionData.calculatedAltitude,
    droneSpecs: {
      sensor: missionData.droneSpecs.sensor,
      focalLength: missionData.droneSpecs.focalLength,
      imageDimensions: missionData.droneSpecs.imageDimensions
    }
  })
  
  // Generate flight plan(s) for candidate heading(s) and pick the best
  let best = { heading: candidateHeadings[0], missions: [] as Mission[], totalTime: Infinity }
  for (const h of candidateHeadings) {
    const ms = partitionAOIIntoPolygonMissions(
      missionData.polygon,
      h,
      lineSpacing,
      missionData.parameters.maxBatteryTime,
      missionData.parameters.droneSpeed,
      photoInterval
    )
    const t = ms.reduce((sum, m) => sum + m.estimatedTime, 0)
    if (t < best.totalTime) {
      best = { heading: h, missions: ms, totalTime: t }
    }
  }
  const missions = best.missions
  const optimalHeading = best.heading
  
  // Calculate total metrics
  const totalTime = missions.reduce((sum, mission) => sum + mission.estimatedTime, 0)
  const totalPhotos = missions.reduce((sum, mission) => sum + mission.estimatedPhotos, 0)
  const totalArea = missionData.polygon.area
  
  // Debug for zero results
  if (totalTime === 0 || totalPhotos === 0) {
    console.warn('⚠️ ZERO FLIGHT PLAN DETECTED:', {
      totalTime,
      totalPhotos,
      missions: missions.length,
      lineSpacing,
      photoInterval,
      polygonArea: totalArea,
      polygonBounds: missionData.polygon.bounds,
      suggestion: 'Area may be too narrow for current line spacing. Try reducing GSD or increasing overlaps.'
    })
  }
  
  // Validate final results
  if (totalTime > 10080) { // More than 1 week
    console.warn(`Total flight time is extremely long (${(totalTime / 60).toFixed(1)} hours). Consider increasing GSD or reducing overlap.`)
  }
  
  if (totalPhotos > 100000) { // More than 100k photos
    console.warn(`Total photo count is extremely high (${totalPhotos.toLocaleString()}). Consider increasing GSD or reducing overlap.`)
  }
  
  return {
    missions,
    totalTime,
    totalPhotos,
    totalArea,
    batteryCount: missions.length,
    optimalHeading
  }
}

function calculateLineLength(coordinates: { lat: number; lng: number }[]): number {
  let totalLength = 0
  for (let i = 1; i < coordinates.length; i++) {
    totalLength += calculateDistance(coordinates[i - 1], coordinates[i])
  }
  return totalLength
}

// --- Polygon-based partitioning ---
function partitionAOIIntoPolygonMissions(
  polygon: Polygon,
  heading: number,
  lineSpacing: number,
  maxBatteryTime: number,
  droneSpeed: number,
  photoInterval: number
): Mission[] {
  const { north, south, east, west } = polygon.bounds
  
  // Dimensions (meters)
  const widthEW = calculateDistance({ lat: north, lng: west }, { lat: north, lng: east })
  const heightNS = calculateDistance({ lat: north, lng: west }, { lat: south, lng: west })
  const perpendicularWidth = (heading === 0 || heading === 180) ? widthEW : heightNS
  const alongHeadingLength = (heading === 0 || heading === 180) ? heightNS : widthEW
  
  const batteryTime = maxBatteryTime * 0.9 // reserve margin
  
  function estimateTimeForStrip(stripWidthM: number): { timeMin: number; numLines: number; totalLength: number } {
    const numLines = Math.max(1, Math.ceil(stripWidthM / lineSpacing) + 1)
    const totalLength = numLines * alongHeadingLength
    const flightTime = totalLength / droneSpeed / 60
    const photoCount = Math.ceil(totalLength / photoInterval)
    const photoTime = (photoCount * 2) / 60
    const turnTime = numLines * 0.5 // 30s per line
    return { timeMin: flightTime + photoTime + turnTime, numLines, totalLength }
  }
  
  function findStripWidthForBattery(maxWidthM: number): number {
    // Binary search width in [lineSpacing, maxWidthM]
    let lo = Math.max(lineSpacing, Math.min(lineSpacing * 1.5, maxWidthM * 0.05))
    let hi = Math.max(lo, maxWidthM)
    let best = lo
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      const { timeMin } = estimateTimeForStrip(mid)
      if (timeMin <= batteryTime) {
        best = mid
        lo = mid
      } else {
        hi = mid
      }
    }
    return Math.min(best, maxWidthM)
  }
  
  const missions: Mission[] = []
  let remainingWidth = perpendicularWidth
  let offsetFromWestOrSouth = 0 // meters from west (if heading NS) or from south (if heading EW)
  let missionIdx = 0
  const colors = ['#ef4444','#10b981','#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#84cc16','#f97316']
  
  while (remainingWidth > 0.1) {
    const widthForBattery = findStripWidthForBattery(remainingWidth)
    const proportionStart = offsetFromWestOrSouth / perpendicularWidth
    const proportionEnd = Math.min(1, (offsetFromWestOrSouth + widthForBattery) / perpendicularWidth)
    
    // Build rectangular strip polygon aligned to bounds
    let strip: Polygon
    if (heading === 0 || heading === 180) {
      // Slice west→east using longitude interpolation
      const lngStart = west + (east - west) * proportionStart
      const lngEnd = west + (east - west) * proportionEnd
      const ring: Coordinate[] = [
        { lat: north, lng: lngStart },
        { lat: north, lng: lngEnd },
        { lat: south, lng: lngEnd },
        { lat: south, lng: lngStart },
        { lat: north, lng: lngStart }
      ]
      strip = {
        coordinates: [ring],
        area: alongHeadingLength * (widthForBattery),
        bounds: { north, south, east: lngEnd, west: lngStart }
      }
    } else {
      // Slice south→north using latitude interpolation
      const latStart = south + (north - south) * proportionStart
      const latEnd = south + (north - south) * proportionEnd
      const ring: Coordinate[] = [
        { lat: latEnd, lng: east },
        { lat: latEnd, lng: west },
        { lat: latStart, lng: west },
        { lat: latStart, lng: east },
        { lat: latEnd, lng: east }
      ]
      strip = {
        coordinates: [ring],
        area: alongHeadingLength * (widthForBattery),
        bounds: { north: latEnd, south: latStart, east, west }
      }
    }

    // Generate lines within this strip
    const rawLines = generateFlightLinesClippedByAOI(strip, polygon, heading, lineSpacing)
    const flightLines: FlightLine[] = rawLines.map((coords, idx) => ({
      id: `m${missionIdx}-line-${idx}`,
      coordinates: coords,
      heading,
      length: calculateLineLength(coords),
      missionIndex: missionIdx,
      lineIndex: idx
    }))

    const mission = createMissionWithArea(flightLines, missionIdx, colors[missionIdx % colors.length], droneSpeed, photoInterval, strip.coordinates[0])
    
    // Build optimized serpentine path with improved turns
    mission.pathSegments = buildSerpentinePathOptimized(
      mission.flightLines, 
      missionIdx, 
      mission.color,
      false, // reverseFirstLine
      droneSpeed,
      polygon
    )
    
    // Derive start/end from full mission path
    if (mission.pathSegments && mission.pathSegments.length > 0) {
      const firstSeg = mission.pathSegments[0]
      const lastSeg = mission.pathSegments[mission.pathSegments.length - 1]
      mission.startPoint = firstSeg.coordinates[0]
      mission.endPoint = lastSeg.coordinates[lastSeg.coordinates.length - 1]
    }
    
    missions.push(mission)

    // Advance
    remainingWidth -= widthForBattery
    offsetFromWestOrSouth += widthForBattery
    missionIdx++

    // Safety to avoid infinite loops
    if (missionIdx > 100) break
  }

  // Merge adjacent missions whose combined time fits a single battery
  const packed = packMissionsByBattery(missions, maxBatteryTime, droneSpeed, photoInterval)

  // Optimize mission chaining for efficient transitions
  const chained = optimizeMissionChaining(packed)

  return chained
}

// Optimize mission transitions to minimize cross-field flights
function optimizeMissionChaining(missions: Mission[]): Mission[] {
  if (missions.length <= 1) return missions
  
  console.log('🔗 Optimizing mission chaining for', missions.length, 'missions')
  
  const optimized: Mission[] = []
  
  // First mission stays as-is
  optimized.push(missions[0])
  
  for (let i = 1; i < missions.length; i++) {
    const prevMission = optimized[i - 1]
    const currentMission = missions[i]
    
    // Find the best start point for current mission based on previous mission's end
    const optimizedMission = optimizeMissionStartPoint(currentMission, prevMission.endPoint)
    optimized.push(optimizedMission)
    
    console.log(`Mission ${i + 1} optimized: transition distance reduced to ${calculateTransitionDistance(prevMission.endPoint, optimizedMission.startPoint)?.toFixed(1)}m`)
  }
  
  return optimized
}

// Optimize a mission's start point and flight direction based on previous mission end
function optimizeMissionStartPoint(mission: Mission, prevEndPoint?: Coordinate): Mission {
  if (!prevEndPoint || !mission.flightLines.length) return mission
  
  // Get all possible start/end combinations for this mission
  const startOptions = getMissionStartEndOptions(mission)
  
  // Find the option with minimum distance from previous mission end
  let bestOption = startOptions[0]
  let minDistance = Infinity
  
  for (const option of startOptions) {
    const distance = calculateDistance(prevEndPoint, option.startPoint)
    if (distance < minDistance) {
      minDistance = distance
      bestOption = option
    }
  }
  
  // Rebuild mission with optimal start configuration
  if (bestOption.reverseOrder || bestOption.reverseFirstLine) {
    return rebuildMissionWithOptimalPath(mission, bestOption.reverseOrder, bestOption.reverseFirstLine)
  }
  
  return mission
}

// Get all possible start/end point combinations for a mission
function getMissionStartEndOptions(mission: Mission): Array<{
  startPoint: Coordinate
  endPoint: Coordinate
  reverseOrder: boolean
  reverseFirstLine: boolean
}> {
  const options: Array<{
    startPoint: Coordinate
    endPoint: Coordinate
    reverseOrder: boolean
    reverseFirstLine: boolean
  }> = []
  
  const lines = mission.flightLines
  if (lines.length === 0) return options
  
  // Option 1: Normal order, normal direction
  const firstLine = lines[0]
  const lastLine = lines[lines.length - 1]
  
  if (firstLine.coordinates.length > 0 && lastLine.coordinates.length > 0) {
    // Normal start
    options.push({
      startPoint: firstLine.coordinates[0],
      endPoint: getEndPointForSerpentine(lines, false, false),
      reverseOrder: false,
      reverseFirstLine: false
    })
    
    // Reverse first line direction
    options.push({
      startPoint: firstLine.coordinates[firstLine.coordinates.length - 1],
      endPoint: getEndPointForSerpentine(lines, false, true),
      reverseOrder: false,
      reverseFirstLine: true
    })
    
    // Reverse line order
    options.push({
      startPoint: lastLine.coordinates[0],
      endPoint: getEndPointForSerpentine(lines, true, false),
      reverseOrder: true,
      reverseFirstLine: false
    })
    
    // Reverse line order AND reverse first line direction
    options.push({
      startPoint: lastLine.coordinates[lastLine.coordinates.length - 1],
      endPoint: getEndPointForSerpentine(lines, true, true),
      reverseOrder: true,
      reverseFirstLine: true
    })
  }
  
  return options
}

// Calculate end point for serpentine path given configuration
function getEndPointForSerpentine(lines: FlightLine[], reverseOrder: boolean, reverseFirstLine: boolean): Coordinate {
  if (lines.length === 0) return { lat: 0, lng: 0 }
  
  const orderedLines = reverseOrder ? [...lines].reverse() : lines
  const lastLine = orderedLines[orderedLines.length - 1]
  
  // For serpentine, determine if last line should be reversed
  const lastLineIndex = orderedLines.length - 1
  const shouldReverseLast = reverseFirstLine ? lastLineIndex % 2 === 0 : lastLineIndex % 2 === 1
  
  if (shouldReverseLast) {
    return lastLine.coordinates[0]
  } else {
    return lastLine.coordinates[lastLine.coordinates.length - 1]
  }
}

// Rebuild mission with optimal flight path configuration
function rebuildMissionWithOptimalPath(mission: Mission, reverseOrder: boolean, reverseFirstLine: boolean): Mission {
  // Create new mission with optimized path
  const newMission = { ...mission }
  
  // Reorder flight lines if needed
  if (reverseOrder) {
    newMission.flightLines = [...mission.flightLines].reverse().map((line, idx) => ({
      ...line,
      lineIndex: idx
    }))
  }
  
  // Rebuild serpentine path with new configuration
  // Use default drone speed for chaining optimization (no polygon available)
  newMission.pathSegments = buildSerpentinePathOptimized(
    newMission.flightLines, 
    mission.index, 
    mission.color,
    reverseFirstLine,
    5, // Default drone speed
    undefined // No polygon available for chaining optimization
  )
  
  // Update start/end points
  if (newMission.pathSegments && newMission.pathSegments.length > 0) {
    const firstSeg = newMission.pathSegments[0]
    const lastSeg = newMission.pathSegments[newMission.pathSegments.length - 1]
    newMission.startPoint = firstSeg.coordinates[0]
    newMission.endPoint = lastSeg.coordinates[lastSeg.coordinates.length - 1]
  }
  
  return newMission
}

// Enhanced serpentine path builder with configurable start direction and optimized turns
function buildSerpentinePathOptimized(
  lines: FlightLine[], 
  missionIndex: number, 
  color: string,
  reverseFirstLine: boolean = false,
  droneSpeed: number = 5,
  polygon?: Polygon
) {
  if (lines.length === 0) return [] as { kind: 'line' | 'connector'; coordinates: Coordinate[]; missionIndex: number; segmentIndex: number; color: string }[]

  // Order lines by proximity using nearest-neighbor algorithm for optimal transitions
  const ordered = orderLinesByProximity(lines, reverseFirstLine)

  // Calculate optimal turn radius based on drone speed
  const turnRadius = calculateTurnRadius(droneSpeed)
  
  console.log(`🔄 Turn optimization for mission ${missionIndex + 1}:`, {
    droneSpeed,
    calculatedTurnRadius: turnRadius.toFixed(1) + 'm',
    lineCount: ordered.length
  })

  // Estimate typical cross-line spacing using the distance between first points
  let spacingSamples: number[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a0 = ordered[i].coordinates[0]
    const b0 = ordered[i + 1].coordinates[0]
    spacingSamples.push(calculateDistance(a0, b0))
  }
  const avgSpacing = spacingSamples.length > 0 ? spacingSamples.reduce((s, v) => s + v, 0) / spacingSamples.length : 10
  const connectorMaxGap = Math.max(3 * avgSpacing, 50) // Increased max gap for better turn handling

  const segments: { kind: 'line' | 'connector'; coordinates: Coordinate[]; missionIndex: number; segmentIndex: number; color: string }[] = []
  let segIdx = 0
  
  for (let i = 0; i < ordered.length; i++) {
    const line = ordered[i]
    
    // Use proximity-based direction if available, otherwise fall back to alternating pattern
    const proximityDirection = (line as any)._proximityDirection
    const shouldReverse = proximityDirection !== undefined ? proximityDirection : 
                         (reverseFirstLine ? i % 2 === 0 : i % 2 === 1)
    const coords = shouldReverse ? [...line.coordinates].reverse() : line.coordinates
    
    // line segment
    segments.push({ kind: 'line', coordinates: coords, missionIndex, segmentIndex: segIdx++, color })
    
    // connector to next line end-start with optimized turns
    if (i < ordered.length - 1) {
      const next = ordered[i + 1]
      const currEnd = coords[coords.length - 1]
      
      // Calculate next start based on proximity-based direction
      const nextProximityDirection = (next as any)._proximityDirection
      const nextShouldReverse = nextProximityDirection !== undefined ? nextProximityDirection :
                               (reverseFirstLine ? (i + 1) % 2 === 0 : (i + 1) % 2 === 1)
      const nextStart = nextShouldReverse ? next.coordinates[next.coordinates.length - 1] : next.coordinates[0]
      
      const gap = calculateDistance(currEnd, nextStart)
      
      if (gap <= connectorMaxGap) {
        // Generate optimized turn waypoints if polygon is available
        if (polygon) {
          const line1Heading = line.heading
          const line2Heading = next.heading
          
          const optimizedTurnWaypoints = generateOptimizedTurn(
            currEnd,
            nextStart,
            line1Heading,
            line2Heading,
            turnRadius,
            polygon
          )
          
          // Use optimized turn waypoints
          if (optimizedTurnWaypoints.length > 2) {
            segments.push({ 
              kind: 'connector', 
              coordinates: optimizedTurnWaypoints, 
              missionIndex, 
              segmentIndex: segIdx++, 
              color 
            })
          } else {
            // Fall back to straight line
            segments.push({ 
              kind: 'connector', 
              coordinates: [currEnd, nextStart], 
              missionIndex, 
              segmentIndex: segIdx++, 
              color 
            })
          }
        } else {
          // Fall back to straight line if no polygon provided
          segments.push({ 
            kind: 'connector', 
            coordinates: [currEnd, nextStart], 
            missionIndex, 
            segmentIndex: segIdx++, 
            color 
          })
        }
      }
    }
  }
  
  return segments
}

// Calculate transition distance between missions (handles undefined points)
function calculateTransitionDistance(point1?: Coordinate, point2?: Coordinate): number | null {
  if (!point1 || !point2) return null
  return calculateDistance(point1, point2)
}

// Order flight lines by proximity using nearest-neighbor algorithm
function orderLinesByProximity(lines: FlightLine[], reverseFirstLine: boolean = false): FlightLine[] {
  if (lines.length <= 1) return lines
  
  console.log(`🔗 Ordering ${lines.length} flight lines by proximity...`)
  
  // Start with the first line (westernmost or southernmost depending on heading)
  const remaining = [...lines]
  const ordered: FlightLine[] = []
  
  // Find the starting line (leftmost/bottommost based on typical survey patterns)
  let currentLine = remaining.reduce((min, line) => {
    const minStart = getLineStartPoint(min, false)
    const lineStart = getLineStartPoint(line, false)
    
    // Choose leftmost line (smallest longitude), then topmost (largest latitude)
    if (lineStart.lng < minStart.lng || 
        (Math.abs(lineStart.lng - minStart.lng) < 0.0001 && lineStart.lat > minStart.lat)) {
      return line
    }
    return min
  })
  
  // Remove the starting line from remaining
  const startIndex = remaining.findIndex(line => line.id === currentLine.id)
  remaining.splice(startIndex, 1)
  
  // Track the direction (forward/reverse) for each line to maintain serpentine pattern
  const lineDirections = new Map<string, boolean>()
  let currentDirection = reverseFirstLine
  lineDirections.set(currentLine.id, currentDirection)
  
  ordered.push(currentLine)
  
  // Build the path using nearest-neighbor
  while (remaining.length > 0) {
    const currentEnd = getLineEndPoint(currentLine, lineDirections.get(currentLine.id) || false)
    
    let nearestLine: FlightLine | null = null
    let minDistance = Infinity
    let bestDirection = false
    
    // Find the nearest unvisited line
    for (const line of remaining) {
      // Try both directions for the candidate line
      for (const direction of [false, true]) {
        const candidateStart = getLineStartPoint(line, direction)
        const distance = calculateDistance(currentEnd, candidateStart)
        
        if (distance < minDistance) {
          minDistance = distance
          nearestLine = line
          bestDirection = direction
        }
      }
    }
    
    if (nearestLine) {
      // Alternate direction for serpentine pattern
      currentDirection = !currentDirection
      lineDirections.set(nearestLine.id, bestDirection)
      
      ordered.push(nearestLine)
      currentLine = nearestLine
      
      // Remove from remaining
      const index = remaining.findIndex(line => line.id === nearestLine!.id)
      remaining.splice(index, 1)
      
      console.log(`  ➡️ Next line: ${nearestLine.id}, distance: ${minDistance.toFixed(1)}m`)
    } else {
      break
    }
  }
  
  console.log(`✅ Proximity ordering complete: ${ordered.length} lines optimized`)
  
  // Update the line directions in the flight line objects for later use
  return ordered.map(line => ({
    ...line,
    _proximityDirection: lineDirections.get(line.id)
  }))
}

// Get the start point of a line (respecting direction)
function getLineStartPoint(line: FlightLine, reverse: boolean): Coordinate {
  if (reverse) {
    return line.coordinates[line.coordinates.length - 1]
  }
  return line.coordinates[0]
}

// Get the end point of a line (respecting direction)
function getLineEndPoint(line: FlightLine, reverse: boolean): Coordinate {
  if (reverse) {
    return line.coordinates[0]
  }
  return line.coordinates[line.coordinates.length - 1]
}

function packMissionsByBattery(
  missions: Mission[],
  maxBatteryTime: number,
  droneSpeed: number,
  photoInterval: number
): Mission[] {
  const effectiveBatteryTime = maxBatteryTime * 0.9
  if (missions.length === 0) return missions

  const result: Mission[] = []
  let acc: Mission | null = null
  let accIdx = 0

  const ringBounds = (ring?: Coordinate[]) => {
    if (!ring || ring.length === 0) return null
    let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity
    for (const p of ring) {
      if (p.lat > north) north = p.lat
      if (p.lat < south) south = p.lat
      if (p.lng > east) east = p.lng
      if (p.lng < west) west = p.lng
    }
    return { north, south, east, west }
  }

  const rectRingFromBounds = (b: { north: number; south: number; east: number; west: number }): Coordinate[] => ([
    { lat: b.north, lng: b.west },
    { lat: b.north, lng: b.east },
    { lat: b.south, lng: b.east },
    { lat: b.south, lng: b.west },
    { lat: b.north, lng: b.west }
  ])

  const recompute = (lines: FlightLine[], index: number, color: string, areaRing?: Coordinate[]): Mission => {
    const m = createMissionWithArea(lines, index, color, droneSpeed, photoInterval, areaRing || [])
    m.pathSegments = buildSerpentinePath(m.flightLines, m.index, m.color)
    if (m.pathSegments && m.pathSegments.length > 0) {
      const firstSeg = m.pathSegments[0]
      const lastSeg = m.pathSegments[m.pathSegments.length - 1]
      m.startPoint = firstSeg.coordinates[0]
      m.endPoint = lastSeg.coordinates[lastSeg.coordinates.length - 1]
    }
    return m
  }

  for (let i = 0; i < missions.length; i++) {
    const m = missions[i]
    if (!acc) {
      acc = { ...m }
      accIdx = result.length
      continue
    }

    const combinedTime = acc.estimatedTime + m.estimatedTime
    if (combinedTime <= effectiveBatteryTime) {
      // merge into acc
      const combinedLines = [...acc.flightLines, ...m.flightLines]
      // combine outline rectangles (based on bounds of rings)
      const b1 = ringBounds(acc.areaPolygon)
      const b2 = ringBounds(m.areaPolygon)
      let mergedRing: Coordinate[] | undefined = undefined
      if (b1 && b2) {
        const b = {
          north: Math.max(b1.north, b2.north),
          south: Math.min(b1.south, b2.south),
          east: Math.max(b1.east, b2.east),
          west: Math.min(b1.west, b2.west)
        }
        mergedRing = rectRingFromBounds(b)
      } else if (b1) {
        mergedRing = rectRingFromBounds(b1)
      } else if (b2) {
        mergedRing = rectRingFromBounds(b2)
      }

      acc = recompute(combinedLines, accIdx, acc.color, mergedRing)
    } else {
      // flush acc and start new
      result.push({ ...acc, index: result.length, id: `mission-${result.length}` })
      acc = { ...m }
      accIdx = result.length
    }
  }

  if (acc) {
    result.push({ ...acc, index: result.length, id: `mission-${result.length}` })
  }

  return result
}

function createMissionWithArea(
  flightLines: FlightLine[],
  index: number,
  color: string,
  droneSpeed: number,
  photoInterval: number,
  areaRing: Coordinate[]
): Mission {
  const estimatedTime = flightLines.reduce((sum, line) => {
    const flightTime = line.length / droneSpeed / 60
    const photoCount = Math.ceil(line.length / photoInterval)
    const photoTime = (photoCount * 2) / 60
    const turnTime = 0.5
    return sum + flightTime + photoTime + turnTime
  }, 0)

  const estimatedPhotos = flightLines.reduce((sum, line) => sum + Math.ceil(line.length / photoInterval), 0)

  // Determine representative start/end points for mission (use longest line)
  let longest: FlightLine | null = null
  for (const fl of flightLines) {
    if (!longest || fl.length > longest.length) longest = fl
  }
  const startPoint = longest && longest.coordinates.length > 0 ? longest.coordinates[0] : undefined
  const endPoint = longest && longest.coordinates.length > 1 ? longest.coordinates[longest.coordinates.length - 1] : undefined

  return {
    id: `mission-${index}`,
    index,
    flightLines,
    estimatedTime,
    estimatedPhotos,
    color,
    areaPolygon: areaRing,
    startPoint,
    endPoint
  }
}

function buildSerpentinePath(lines: FlightLine[], missionIndex: number, color: string) {
  if (lines.length === 0) return [] as { kind: 'line' | 'connector'; coordinates: Coordinate[]; missionIndex: number; segmentIndex: number; color: string }[]

  // Order by perpendicular offset (use lineIndex as a proxy)
  const ordered = [...lines].sort((a, b) => a.lineIndex - b.lineIndex)

  // Estimate typical cross-line spacing using the distance between first points
  let spacingSamples: number[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a0 = ordered[i].coordinates[0]
    const b0 = ordered[i + 1].coordinates[0]
    spacingSamples.push(calculateDistance(a0, b0))
  }
  const avgSpacing = spacingSamples.length > 0 ? spacingSamples.reduce((s, v) => s + v, 0) / spacingSamples.length : 10
  const connectorMaxGap = Math.max(3 * avgSpacing, 20) // meters

  const segments: { kind: 'line' | 'connector'; coordinates: Coordinate[]; missionIndex: number; segmentIndex: number; color: string }[] = []
  let segIdx = 0
  for (let i = 0; i < ordered.length; i++) {
    const line = ordered[i]
    const forward = i % 2 === 0
    const coords = forward ? line.coordinates : [...line.coordinates].reverse()
    // line segment
    segments.push({ kind: 'line', coordinates: coords, missionIndex, segmentIndex: segIdx++, color })
    // connector to next line end-start
    if (i < ordered.length - 1) {
      const next = ordered[i + 1]
      const currEnd = coords[coords.length - 1]
      const nextStart = (i + 1) % 2 === 0 ? next.coordinates[0] : next.coordinates[next.coordinates.length - 1]
      const gap = calculateDistance(currEnd, nextStart)
      if (gap <= connectorMaxGap) {
        segments.push({ kind: 'connector', coordinates: [currEnd, nextStart], missionIndex, segmentIndex: segIdx++, color })
      } // else: start a new sub-path, no long diagonal connector across gaps
    }
  }
  return segments
}

// Previous line-based partition retained (unused by default)
function partitionIntoMissions(
  flightLines: FlightLine[],
  maxBatteryTime: number,
  droneSpeed: number,
  photoInterval: number
): Mission[] {
  const missions: Mission[] = []
  const missionColors = [
    '#ef4444', // red
    '#10b981', // green
    '#3b82f6', // blue
    '#f59e0b', // yellow
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#f97316'  // orange
  ]
  
  let currentMission: FlightLine[] = []
  let currentMissionTime = 0
  let missionIndex = 0
  
  for (const flightLine of flightLines) {
    // Calculate time for this flight line
    const flightTime = flightLine.length / droneSpeed / 60 // Convert to minutes
    const photoCount = Math.ceil(flightLine.length / photoInterval)
    const photoTime = photoCount * 2 / 60 // 2 seconds per photo, convert to minutes
    
    // Add turn time penalty (30 seconds per turn)
    const turnTime = 0.5 // minutes
    
    const totalLineTime = flightTime + photoTime + turnTime
    
    // Check if adding this line would exceed battery time
    // Use 90% of max battery time to leave some safety margin
    const effectiveBatteryTime = maxBatteryTime * 0.9
    
    if (currentMissionTime + totalLineTime > effectiveBatteryTime && currentMission.length > 0) {
      // Create mission with current lines
      missions.push(createMission(currentMission, missionIndex, missionColors[missionIndex % missionColors.length], droneSpeed, photoInterval))
      
      // Start new mission
      currentMission = []
      currentMissionTime = 0
      missionIndex++
    }
    
    // Add line to current mission
    currentMission.push({
      ...flightLine,
      missionIndex
    })
    currentMissionTime += totalLineTime
  }
  
  // Add final mission if there are remaining lines
  if (currentMission.length > 0) {
    missions.push(createMission(currentMission, missionIndex, missionColors[missionIndex % missionColors.length], droneSpeed, photoInterval))
  }
  
  return missions
}

function createMission(flightLines: FlightLine[], index: number, color: string, droneSpeed: number, photoInterval: number): Mission {
  // Calculate mission metrics using actual parameters
  const estimatedTime = flightLines.reduce((sum, line) => {
    const flightTime = line.length / droneSpeed / 60 // Convert to minutes
    const photoCount = Math.ceil(line.length / photoInterval)
    const photoTime = photoCount * 2 / 60 // 2 seconds per photo
    const turnTime = 0.5 // 30 seconds per turn
    return sum + flightTime + photoTime + turnTime
  }, 0)
  
  const estimatedPhotos = flightLines.reduce((sum, line) => {
    return sum + Math.ceil(line.length / photoInterval)
  }, 0)
  
  return {
    id: `mission-${index}`,
    index,
    flightLines,
    estimatedTime,
    estimatedPhotos,
    color
  }
} 
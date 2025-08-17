import { MissionData, FlightPlan, Mission, FlightLine, Coordinate, Polygon } from '@/types/mission'
import { 
  calculateOptimalHeading, 
  calculateLineSpacing, 
  calculatePhotoInterval,
  generateFlightLines,
  calculateDistance, 
  generateFlightLinesClippedByAOI
} from './geometry'

export function generateFlightPlan(missionData: MissionData): FlightPlan {
  // Evaluate both principal headings (0° and 90°) and pick the better
  const candidateHeadings = [0, 90]
  
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
  
  console.log('Flight plan generation parameters:', {
    gsd: missionData.parameters.gsd,
    lineSpacing,
    photoInterval,
    calculatedAltitude: missionData.calculatedAltitude
  })
  
  // Generate for both candidate headings and pick better total time
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
    
    // Build serpentine path with connectors for visualization
    mission.pathSegments = buildSerpentinePath(mission.flightLines, missionIdx, mission.color)
    
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

  return packed
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
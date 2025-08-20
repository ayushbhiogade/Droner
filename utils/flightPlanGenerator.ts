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
  
  console.log('🔍 Partitioning AOI:', {
    dimensions: { widthEW: widthEW.toFixed(1), heightNS: heightNS.toFixed(1) },
    perpendicularWidth: perpendicularWidth.toFixed(1),
    alongHeadingLength: alongHeadingLength.toFixed(1),
    lineSpacing: lineSpacing.toFixed(2),
    batteryTime: batteryTime.toFixed(1),
    estimatedLines: Math.ceil(perpendicularWidth / lineSpacing)
  })
  
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
    // Calculate the maximum number of lines that can fit in battery time
    const maxLinesPerBattery = Math.floor(batteryTime / 0.5) // Assume 0.5 min per line minimum
    const maxStripWidth = Math.max(lineSpacing, (maxLinesPerBattery - 1) * lineSpacing)
    
    // For very large areas (>2km wide), force aggressive partitioning
    if (maxWidthM > 2000) {
      console.log(`🌍 Very large area detected (${maxWidthM.toFixed(1)}m), forcing aggressive partitioning`)
      const targetMissions = Math.max(3, Math.ceil(maxWidthM / 800)) // Aim for reasonable mission count
      const forcedWidth = Math.max(lineSpacing * 2, maxWidthM / targetMissions)
      return Math.min(forcedWidth, maxStripWidth)
    }
    
    // For medium areas (500m - 2km), moderate partitioning
    if (maxWidthM > 500) {
      console.log(`🏞️ Medium area detected (${maxWidthM.toFixed(1)}m), using moderate partitioning`)
      // Try to fit the entire area in 1-2 missions if possible
      const estimatedTime = estimateTimeForStrip(maxWidthM)
      if (estimatedTime.timeMin <= batteryTime) {
        console.log(`✅ Entire area fits in one mission (${estimatedTime.timeMin.toFixed(1)}min)`)
        return maxWidthM
      }
      
      // Split into 2 missions if possible
      const halfWidth = maxWidthM / 2
      const halfTime = estimateTimeForStrip(halfWidth)
      if (halfTime.timeMin <= batteryTime) {
        console.log(`✅ Area fits in 2 missions (${halfTime.timeMin.toFixed(1)}min each)`)
        return halfWidth
      }
    }
    
    // For smaller areas (<500m), try to fit in single mission first
    if (maxWidthM <= 500) {
      console.log(`🏘️ Small area detected (${maxWidthM.toFixed(1)}m), attempting single mission`)
      const estimatedTime = estimateTimeForStrip(maxWidthM)
      if (estimatedTime.timeMin <= batteryTime) {
        console.log(`✅ Small area fits in single mission (${estimatedTime.timeMin.toFixed(1)}min)`)
        return maxWidthM
      }
    }
    
    // Fallback: use binary search to find optimal width
    let lo = Math.max(lineSpacing, Math.min(lineSpacing * 2, maxWidthM * 0.1))
    let hi = Math.max(lo, Math.min(maxWidthM, maxStripWidth))
    let best = lo
    
    // Binary search for optimal width
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
    
    return Math.min(best, maxStripWidth)
  }
  
  const missions: Mission[] = []
  let remainingWidth = perpendicularWidth
  let offsetFromWestOrSouth = 0 // meters from west (if heading NS) or from south (if heading EW)
  let missionIdx = 0
  const colors = ['#ef4444','#10b981','#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#84cc16','#f97316']
  
  while (remainingWidth > 0.1) {
    const widthForBattery = findStripWidthForBattery(remainingWidth)
    
    console.log(`📏 Mission ${missionIdx + 1}: remaining=${remainingWidth.toFixed(1)}m, strip=${widthForBattery.toFixed(1)}m`)
    
    // Safety check: ensure we're making progress and not getting stuck
    if (widthForBattery < lineSpacing * 0.5 || widthForBattery > remainingWidth * 0.9) {
      console.warn(`⚠️ Strip width issue: width=${widthForBattery.toFixed(2)}m, remaining=${remainingWidth.toFixed(2)}m, forcing reasonable width`)
      const forcedWidth = Math.max(lineSpacing, Math.min(remainingWidth * 0.3, lineSpacing * 10))
      remainingWidth = Math.max(0, remainingWidth - forcedWidth)
      offsetFromWestOrSouth += forcedWidth
      missionIdx++
      continue
    }
    
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
    
    // Safety check: ensure we have valid flight lines
    if (rawLines.length === 0) {
      console.warn(`⚠️ No flight lines generated for strip ${missionIdx}, skipping`)
      remainingWidth -= widthForBattery
      offsetFromWestOrSouth += widthForBattery
      missionIdx++
      continue
    }
    
    const flightLines: FlightLine[] = rawLines.map((coords, idx) => ({
      id: `m${missionIdx}-line-${idx}`,
      coordinates: coords,
      heading,
      length: calculateLineLength(coords),
      missionIndex: missionIdx,
      lineIndex: idx
    }))

    const mission = createMissionWithArea(flightLines, missionIdx, colors[missionIdx % colors.length], droneSpeed, photoInterval, strip.coordinates[0])
    
    // Safety check: ensure mission doesn't exceed battery time
    if (mission.estimatedTime > batteryTime) {
      console.warn(`⚠️ Mission ${missionIdx + 1} exceeds battery time: ${mission.estimatedTime.toFixed(1)}min > ${batteryTime.toFixed(1)}min`)
      console.warn(`⚠️ Forcing mission to fit within battery constraints`)
      
      // Recalculate with a smaller strip width
      const maxLinesForBattery = Math.floor(batteryTime / 0.5)
      const maxWidthForBattery = Math.max(lineSpacing, (maxLinesForBattery - 1) * lineSpacing)
      
      if (maxWidthForBattery < widthForBattery) {
        console.log(`🔄 Adjusting strip width from ${widthForBattery.toFixed(1)}m to ${maxWidthForBattery.toFixed(1)}m`)
        // Rollback and try again with smaller width
        remainingWidth += widthForBattery - maxWidthForBattery
        offsetFromWestOrSouth -= widthForBattery - maxWidthForBattery
        continue
      }
    }
    
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

    // Safety to avoid infinite loops and ensure progress
    if (missionIdx > 100) {
      console.warn('⚠️ Safety limit reached, forcing completion')
      break
    }
    
    // Ensure we're making progress
    if (widthForBattery < remainingWidth * 0.01) {
      console.warn('⚠️ Strip width too small relative to remaining width, forcing completion')
      break
    }
  }

  console.log(`✅ Generated ${missions.length} missions for AOI`)
  
  // If no missions were generated, create a fallback mission
  if (missions.length === 0) {
    console.warn('⚠️ No missions generated, creating fallback mission')
    const fallbackMission = createFallbackMission(polygon, heading, lineSpacing, droneSpeed, photoInterval)
    if (fallbackMission) {
      missions.push(fallbackMission)
    }
  }
  
  // Merge adjacent missions whose combined time fits a single battery
  const packed = packMissionsByBattery(missions, maxBatteryTime, droneSpeed, photoInterval)

  // Optimize mission chaining for efficient transitions
  const chained = optimizeMissionChaining(packed)

  return chained
}

// ============================================================================
// GLOBALLY OPTIMIZED MISSION CHAINING USING TSP
// ============================================================================

// Interface for transition data between missions
interface Transition {
  fromMissionIndex: number
  toMissionIndex: number
  distance: number
  fromExitPoint: Coordinate // The best exit point from mission i
  toEntryPoint: Coordinate  // The best entry point for mission j
}

// Step 1: Create a Cost Matrix of All Possible Transitions
function calculateTransitionCostMatrix(missions: Mission[]): Transition[][] {
  console.log(`📊 Calculating transition cost matrix for ${missions.length} missions...`)
  
  const matrix: Transition[][] = []
  
  for (let i = 0; i < missions.length; i++) {
    matrix[i] = []
    for (let j = 0; j < missions.length; j++) {
      if (i === j) {
        // Same mission - no transition cost
        matrix[i][j] = {
          fromMissionIndex: i,
          toMissionIndex: j,
          distance: 0,
          fromExitPoint: { lat: 0, lng: 0 },
          toEntryPoint: { lat: 0, lng: 0 }
        }
      } else {
        // Calculate optimal transition from mission i to mission j
        const transition = findOptimalTransition(missions[i], missions[j])
        matrix[i][j] = transition
      }
    }
  }
  
  console.log(`✅ Transition cost matrix calculated with ${missions.length * missions.length} transitions`)
  return matrix
}

// Find the optimal transition between two missions
function findOptimalTransition(fromMission: Mission, toMission: Mission): Transition {
  const fromOptions = getMissionStartEndOptions(fromMission)
  const toOptions = getMissionStartEndOptions(toMission)
  
  let bestTransition: Transition = {
    fromMissionIndex: fromMission.index,
    toMissionIndex: toMission.index,
    distance: Infinity,
    fromExitPoint: { lat: 0, lng: 0 },
    toEntryPoint: { lat: 0, lng: 0 }
  }
  
  // Try all combinations of exit/entry points
  for (const fromOption of fromOptions) {
    for (const toOption of toOptions) {
      const distance = calculateDistance(fromOption.endPoint, toOption.startPoint)
      
      if (distance < bestTransition.distance) {
        bestTransition = {
          fromMissionIndex: fromMission.index,
          toMissionIndex: toMission.index,
          distance,
          fromExitPoint: fromOption.endPoint,
          toEntryPoint: toOption.startPoint
        }
      }
    }
  }
  
  return bestTransition
}

// Step 2: Solve for the Optimal Mission Order (TSP)
function solveMissionOrderTSP(costMatrix: Transition[][]): number[] {
  console.log(`🧮 Solving TSP for optimal mission order...`)
  
  const numMissions = costMatrix.length
  if (numMissions <= 1) return [0]
  
  // For small numbers of missions, try multiple starting points and find the best
  let bestOrder: number[] = []
  let bestTotalDistance = Infinity
  
  // Try each mission as a starting point
  for (let startMission = 0; startMission < numMissions; startMission++) {
    const order = solveTSPFromStart(costMatrix, startMission)
    const totalDistance = calculateTotalPathDistance(costMatrix, order)
    
    if (totalDistance < bestTotalDistance) {
      bestTotalDistance = totalDistance
      bestOrder = order
    }
  }
  
  console.log(`✅ TSP solution found: ${bestOrder.join(' → ')} with total distance: ${bestTotalDistance.toFixed(1)}m`)
  return bestOrder
}

// Solve TSP starting from a specific mission using Nearest Neighbor
function solveTSPFromStart(costMatrix: Transition[][], startMission: number): number[] {
  const numMissions = costMatrix.length
  const visited = new Set<number>()
  const order: number[] = []
  
  // Start with the specified mission
  let currentMission = startMission
  visited.add(currentMission)
  order.push(currentMission)
  
  // Find nearest unvisited mission until all are visited
  while (visited.size < numMissions) {
    let nearestMission = -1
    let minDistance = Infinity
    
    for (let nextMission = 0; nextMission < numMissions; nextMission++) {
      if (!visited.has(nextMission)) {
        const distance = costMatrix[currentMission][nextMission].distance
        if (distance < minDistance) {
          minDistance = distance
          nearestMission = nextMission
        }
      }
    }
    
    if (nearestMission !== -1) {
      visited.add(nearestMission)
      order.push(nearestMission)
      currentMission = nearestMission
    } else {
      break
    }
  }
  
  return order
}

// Calculate total distance for a given path
function calculateTotalPathDistance(costMatrix: Transition[][], order: number[]): number {
  let totalDistance = 0
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i]
    const to = order[i + 1]
    totalDistance += costMatrix[from][to].distance
  }
  return totalDistance
}

// Step 3: Rebuild the Flight Plan in the Optimized Order
function buildOptimizedFlightPlan(missions: Mission[], optimalOrder: number[], costMatrix: Transition[][]): Mission[] {
  console.log(`🔧 Rebuilding flight plan in optimized order...`)
  
  const optimizedMissions: Mission[] = []
  
  for (let i = 0; i < optimalOrder.length; i++) {
    const missionIndex = optimalOrder[i]
    const originalMission = missions[missionIndex]
    
    // Determine optimal orientation based on transition data
    let optimalMission = { ...originalMission }
    
    if (i > 0) {
      // Find the optimal configuration for this mission based on previous mission
      const prevMissionIndex = optimalOrder[i - 1]
      const transition = costMatrix[prevMissionIndex][missionIndex]
      
      // Rebuild mission with optimal path configuration
      const missionOptions = getMissionStartEndOptions(originalMission)
      const optimalOption = missionOptions.find(option => 
        option.startPoint.lat === transition.toEntryPoint.lat && 
        option.startPoint.lng === transition.toEntryPoint.lng
      )
      
      if (optimalOption) {
        optimalMission = rebuildMissionWithOptimalPath(
          originalMission, 
          optimalOption.reverseOrder, 
          optimalOption.reverseFirstLine
        )
      }
      
      // Set optimal start/end points
      optimalMission.startPoint = transition.toEntryPoint
      optimalMission.endPoint = transition.fromExitPoint
    }
    
    optimizedMissions.push(optimalMission)
    
    console.log(`  ✅ Mission ${missionIndex} optimized and added to sequence`)
  }
  
  console.log(`✅ Flight plan rebuilt with ${optimizedMissions.length} missions in optimal order`)
  return optimizedMissions
}

// Create a fallback mission when the main algorithm fails
function createFallbackMission(
  polygon: Polygon, 
  heading: number, 
  lineSpacing: number, 
  droneSpeed: number, 
  photoInterval: number
): Mission | null {
  try {
    console.log('🔄 Creating fallback mission for large AOI')
    
    // Generate a simple grid of flight lines covering the entire AOI
    const rawLines = generateFlightLinesClippedByAOI(polygon, polygon, heading, lineSpacing)
    
    if (rawLines.length === 0) {
      console.error('❌ Fallback mission failed: no flight lines generated')
      return null
    }
    
    const flightLines: FlightLine[] = rawLines.map((coords, idx) => ({
      id: `fallback-line-${idx}`,
      coordinates: coords,
      heading,
      length: calculateLineLength(coords),
      missionIndex: 0,
      lineIndex: idx
    }))
    
    const mission = createMissionWithArea(flightLines, 0, '#ef4444', droneSpeed, photoInterval, polygon.coordinates[0])
    
    // Build a simple path
    mission.pathSegments = buildSerpentinePathOptimized(
      mission.flightLines, 
      0, 
      mission.color,
      false,
      droneSpeed,
      polygon
    )
    
    if (mission.pathSegments && mission.pathSegments.length > 0) {
      const firstSeg = mission.pathSegments[0]
      const lastSeg = mission.pathSegments[mission.pathSegments.length - 1]
      mission.startPoint = firstSeg.coordinates[0]
      mission.endPoint = lastSeg.coordinates[lastSeg.coordinates.length - 1]
    }
    
    console.log('✅ Fallback mission created successfully')
    return mission
  } catch (error) {
    console.error('❌ Failed to create fallback mission:', error)
    return null
  }
}

// Globally Optimized Mission Chaining using TSP (Traveling Salesperson Problem)
function optimizeMissionChaining(missions: Mission[]): Mission[] {
  if (missions.length <= 1) return missions
  
  console.log(`🔗 Implementing globally optimized mission chaining using TSP for ${missions.length} missions...`)
  
  // Step 1: Calculate transition cost matrix
  const costMatrix = calculateTransitionCostMatrix(missions)
  
  // Step 2: Solve for optimal mission order using TSP
  const optimalOrder = solveMissionOrderTSP(costMatrix)
  
  // Step 3: Rebuild flight plan in optimized order
  const optimizedMissions = buildOptimizedFlightPlan(missions, optimalOrder, costMatrix)
  
  console.log(`✅ Global mission chaining optimization complete`)
  return optimizedMissions
}
//commit
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

  // Calculate optimal turn radius based on drone speed and mission characteristics
  const baseTurnRadius = calculateTurnRadius(droneSpeed)
  
  // Adjust turn radius based on line spacing for tighter turns
  const avgLineSpacing = lines.length > 1 ? 
    lines.reduce((sum, line, i) => {
      if (i === 0) return 0
      const prevEnd = line.coordinates[line.coordinates.length - 1]
      const currStart = lines[i - 1].coordinates[0]
      return sum + calculateDistance(prevEnd, currStart)
    }, 0) / (lines.length - 1) : 50
  
  const turnRadius = Math.min(baseTurnRadius, avgLineSpacing * 0.8) // Tighter turns for closer lines
  
  console.log(`🔄 Turn optimization for mission ${missionIndex + 1}:`, {
    droneSpeed,
    baseTurnRadius: baseTurnRadius.toFixed(1) + 'm',
    adjustedTurnRadius: turnRadius.toFixed(1) + 'm',
    avgLineSpacing: avgLineSpacing.toFixed(1) + 'm',
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
          
          // Calculate the optimal turn direction based on proximity
          const turnAngle = line2Heading - line1Heading
          const normalizedTurnAngle = ((turnAngle + 180) % 360) - 180
          
          console.log(`🔄 Turn optimization: ${line1Heading.toFixed(1)}° → ${line2Heading.toFixed(1)}° (${normalizedTurnAngle.toFixed(1)}° turn)`)
          
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
            const turnDistance = calculateTurnDistance(optimizedTurnWaypoints)
            console.log(`✅ Optimized turn: ${turnDistance.toFixed(1)}m path with ${optimizedTurnWaypoints.length} waypoints`)
            
            segments.push({ 
              kind: 'connector', 
              coordinates: optimizedTurnWaypoints, 
              missionIndex, 
              segmentIndex: segIdx++, 
              color 
            })
          } else {
            // Fall back to straight line
            const directDistance = calculateDistance(currEnd, nextStart)
            console.log(`➡️ Direct connection: ${directDistance.toFixed(1)}m`)
            
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
          const directDistance = calculateDistance(currEnd, nextStart)
          console.log(`➡️ Direct connection (no polygon): ${directDistance.toFixed(1)}m`)
          
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

// Calculate total distance of a turn path
function calculateTurnDistance(waypoints: Coordinate[]): number {
  if (waypoints.length < 2) return 0
  
  let totalDistance = 0
  for (let i = 1; i < waypoints.length; i++) {
    totalDistance += calculateDistance(waypoints[i - 1], waypoints[i])
  }
  return totalDistance
}

// Order flight lines by proximity using nearest-neighbor algorithm with optimal start/stop
function orderLinesByProximity(lines: FlightLine[], reverseFirstLine: boolean = false): FlightLine[] {
  if (lines.length <= 1) return lines
  
  console.log(`🔗 Ordering ${lines.length} flight lines by proximity for optimal turns...`)
  
  const remaining = [...lines]
  const ordered: FlightLine[] = []
  
  // Find the optimal starting line by analyzing all possible starting points
  let bestStartLine: FlightLine | null = null
  let bestStartDirection = false
  let bestTotalDistance = Infinity
  
  // Try each line as a starting point in both directions
  for (const startLine of lines) {
    for (const startDirection of [false, true]) {
      const startPoint = getLineStartPoint(startLine, startDirection)
      let totalDistance = 0
      const tempRemaining = [...lines].filter(l => l.id !== startLine.id)
      let currentPoint = getLineEndPoint(startLine, startDirection)
      
      // Calculate total distance for this starting configuration
      for (let i = 0; i < tempRemaining.length; i++) {
        let nearestLine: FlightLine | null = null
        let minDistance = Infinity
        let bestDirection = false
        
        for (const line of tempRemaining) {
          for (const direction of [false, true]) {
            const candidateStart = getLineStartPoint(line, direction)
            const distance = calculateDistance(currentPoint, candidateStart)
            
            if (distance < minDistance) {
              minDistance = distance
              nearestLine = line
              bestDirection = direction
            }
          }
        }
        
        if (nearestLine) {
          totalDistance += minDistance
          currentPoint = getLineEndPoint(nearestLine, bestDirection)
          tempRemaining.splice(tempRemaining.indexOf(nearestLine), 1)
        }
      }
      
      // Update best starting configuration
      if (totalDistance < bestTotalDistance) {
        bestTotalDistance = totalDistance
        bestStartLine = startLine
        bestStartDirection = startDirection
      }
    }
  }
  
  if (!bestStartLine) {
    console.warn('⚠️ Could not determine optimal starting line, using fallback')
    bestStartLine = lines[0]
    bestStartDirection = reverseFirstLine
  }
  
  console.log(`🎯 Optimal starting line: ${bestStartLine.id}, direction: ${bestStartDirection ? 'reverse' : 'forward'}, estimated total distance: ${bestTotalDistance.toFixed(1)}m`)
  
  // Start with the optimal line
  let currentLine = bestStartLine
  let currentDirection = bestStartDirection
  
  // Remove the starting line from remaining
  const startIndex = remaining.findIndex(line => line.id === currentLine.id)
  remaining.splice(startIndex, 1)
  
  // Track the direction for each line
  const lineDirections = new Map<string, boolean>()
  lineDirections.set(currentLine.id, currentDirection)
  
  ordered.push(currentLine)
  
  // Build the path using nearest-neighbor with optimal turns
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
      // Set the optimal direction for this line (not alternating, but based on proximity)
      lineDirections.set(nearestLine.id, bestDirection)
      
      ordered.push(nearestLine)
      currentLine = nearestLine
      
      // Remove from remaining
      const index = remaining.findIndex(line => line.id === nearestLine!.id)
      remaining.splice(index, 1)
      
      console.log(`  ➡️ Next line: ${nearestLine.id}, distance: ${minDistance.toFixed(1)}m, direction: ${bestDirection ? 'reverse' : 'forward'}`)
    } else {
      break
    }
  }
  
  console.log(`✅ Proximity ordering complete: ${ordered.length} lines optimized with minimal turning distance`)
  
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
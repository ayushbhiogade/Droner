import { MissionData, FlightPlan, Mission } from '@/types/mission'
import { calculatePhotoInterval } from '@/utils/geometry'

// Generate KML export with drone-specific specifications
export function generateKMLExport(flightPlan: FlightPlan, missionData: MissionData): string {
  return generateDroneSpecificKML(flightPlan, missionData)
}

// Generate DroneDeploy-compatible KML export
export function generateDroneDeployKML(flightPlan: FlightPlan, missionData: MissionData): string {
  const droneModel = getDroneModelFromSpecs(missionData.droneSpecs)
  const currentDate = new Date().toISOString().split('T')[0]
  
  // Simple KML structure optimized for DroneDeploy
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${droneModel} Survey Mission</name>
    <description>
      Flight Plan for DroneDeploy
      Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
      GSD: ${missionData.parameters.gsd} cm/px
      Generated: ${currentDate}
      
      Polygon Status: ${missionData.polygon ? 'Valid polygon data found' : 'No polygon data'}
      ${missionData.polygon && missionData.polygon.coordinates ? `Coordinate rings: ${missionData.polygon.coordinates.length}` : ''}
      ${missionData.polygon && missionData.polygon.coordinates && missionData.polygon.coordinates[0] ? `Points in outer ring: ${missionData.polygon.coordinates[0].length}` : ''}
    </description>
    
    <!-- Mission Settings for DroneDeploy -->
    <ExtendedData>
      <Data name="flightAltitude">
        <value>${missionData.calculatedAltitude.toFixed(1)}</value>
      </Data>
      <Data name="altitudeType">
        <value>agl</value>
      </Data>
      <Data name="gsd">
        <value>${missionData.parameters.gsd}</value>
      </Data>
      <Data name="frontOverlap">
        <value>${missionData.parameters.frontOverlap}</value>
      </Data>
      <Data name="sideOverlap">
        <value>${missionData.parameters.sideOverlap}</value>
      </Data>
      <Data name="droneSpeed">
        <value>${missionData.parameters.droneSpeed}</value>
      </Data>
      <Data name="aircraftType">
        <value>${droneModel}</value>
      </Data>
    </ExtendedData>`

  // Generate waypoint missions for DroneDeploy
  const waypointMissions = flightPlan.missions.map((mission, missionIndex) => {
    let waypointCounter = 1
    const waypoints = mission.flightLines.map((flightLine, lineIndex) => {
      return flightLine.coordinates.map((coord, coordIndex) => {
        const waypointName = `WP${waypointCounter++}`
        return `
      <Placemark>
        <name>${waypointName}</name>
        <description>
          Mission: ${missionIndex + 1}
          Line: ${lineIndex + 1}
          Waypoint: ${coordIndex + 1}
          Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
          Speed: ${missionData.parameters.droneSpeed} m/s
          Action: Photo
        </description>
        <ExtendedData>
          <Data name="waypointIndex">
            <value>${waypointCounter - 1}</value>
          </Data>
          <Data name="altitude">
            <value>${missionData.calculatedAltitude.toFixed(1)}</value>
          </Data>
          <Data name="speed">
            <value>${missionData.parameters.droneSpeed}</value>
          </Data>
          <Data name="action">
            <value>photo</value>
          </Data>
        </ExtendedData>
        <Point>
          <altitudeMode>relativeToGround</altitudeMode>
          <coordinates>${coord.lng},${coord.lat},${missionData.calculatedAltitude}</coordinates>
        </Point>
      </Placemark>`
      }).join('')
    }).join('')
    
    return `
    <Folder>
      <name>Mission ${missionIndex + 1}</name>
      <description>
        Battery Mission ${missionIndex + 1}
        Estimated Time: ${mission.estimatedTime.toFixed(1)} minutes
        Photos: ${mission.estimatedPhotos}
        Flight Lines: ${mission.flightLines.length}
      </description>
      ${waypoints}
    </Folder>`
  }).join('')

  // Generate survey area boundary with proper validation
  const surveyArea = missionData.polygon && missionData.polygon.coordinates && missionData.polygon.coordinates[0] && missionData.polygon.coordinates[0].length >= 4 ? `
    <Placemark>
      <name>Survey Area</name>
      <description>Area of Interest - ${(flightPlan.totalArea / 4046.86).toFixed(2)} acres</description>
      <Style>
        <PolyStyle>
          <color>4d0000ff</color>
          <fill>1</fill>
          <outline>1</outline>
        </PolyStyle>
        <LineStyle>
          <color>ff0000ff</color>
          <width>2</width>
        </LineStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${generateValidPolygonCoordinates(missionData.polygon.coordinates[0])}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>` : ''

  // Generate flight path visualization
  const flightPaths = flightPlan.missions.map((mission, missionIndex) => {
    return mission.flightLines.map((flightLine, lineIndex) => `
    <Placemark>
      <name>Flight Path ${missionIndex + 1}-${lineIndex + 1}</name>
      <description>
        Flight Line ${lineIndex + 1} of Mission ${missionIndex + 1}
        Length: ${flightLine.length.toFixed(1)}m
        Heading: ${flightLine.heading.toFixed(0)}°
      </description>
      <Style>
        <LineStyle>
          <color>ff0000ff</color>
          <width>3</width>
        </LineStyle>
      </Style>
      <LineString>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>
          ${flightLine.coordinates.map(coord => `${coord.lng},${coord.lat},${missionData.calculatedAltitude}`).join('\n          ')}
        </coordinates>
      </LineString>
    </Placemark>`).join('')
  }).join('')

  const kmlFooter = `
  
  <!-- Survey Area -->
  ${surveyArea}
  
  <!-- Flight Paths -->
  <Folder>
    <name>Flight Paths</name>
    <description>Visual flight lines for reference</description>
    ${flightPaths}
  </Folder>
  
  <!-- Waypoint Missions -->
  <Folder>
    <name>Waypoint Missions</name>
    <description>Individual waypoints for mission execution</description>
    ${waypointMissions}
  </Folder>
  
  </Document>
</kml>`

  return kmlHeader + kmlFooter
}

// Generate KMZ export with read-only protection
export async function generateKMZExport(flightPlan: FlightPlan, missionData: MissionData): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  
  // Generate the main KML content
  const kmlContent = generateDroneSpecificKML(flightPlan, missionData)
  
  // Add KML file to the archive
  zip.file('doc.kml', kmlContent)
  
  // Generate mission documentation
  const missionDoc = generateMissionDocumentation(flightPlan, missionData)
  zip.file('mission-briefing.txt', missionDoc)
  
  // Add read-only protection file
  const protectionDoc = generateProtectionDocumentation(flightPlan, missionData)
  zip.file('READ-ONLY-NOTICE.txt', protectionDoc)
  
  // Add flight plan summary
  const summaryDoc = generateFlightPlanSummary(flightPlan, missionData)
  zip.file('flight-summary.txt', summaryDoc)
  
  // Generate the KMZ file
  const kmzBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9 // Maximum compression
    }
  })
  
  return kmzBlob
}

// Generate DJI Waylines (WPML) KMZ: template.kml + missions.wpml
export async function generateDJIWPMLKMZ(flightPlan: FlightPlan, missionData: MissionData): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  // DJI Pilot 2 expects KML containers with wpml tags
  const templateKML = buildDJITemplateKML(flightPlan, missionData)
  const waylinesWPML = buildDJIWPMLPure(flightPlan, missionData)
  const wpmz = zip.folder('wpmz')
  wpmz?.file('template.kml', templateKML)
  wpmz?.file('missions.wpml', waylinesWPML)

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  })
  return blob
}

// Export only the DJI WPML XML as a raw string (for manual zipping)
export function generateDJIWPMLRaw(flightPlan: FlightPlan, missionData: MissionData): string {
  return buildDJIWPMLPure(flightPlan, missionData)
}

function buildDJITemplateKML(flightPlan: FlightPlan, missionData: MissionData): string {
  const altitude = Number(missionData.calculatedAltitude.toFixed(1))
  const speed = Number(missionData.parameters.droneSpeed)
  const frontOverlap = Number(missionData.parameters.frontOverlap)
  const sideOverlap = Number(missionData.parameters.sideOverlap)
  const optimalHeading = Math.round(flightPlan.optimalHeading || 0)
  const model = getDroneModelFromSpecs(missionData.droneSpecs)
  const payloadEnumValue = model === 'DJI Matrice 4E' ? 88 : 89
  const payloadSubEnumValue = model === 'DJI Matrice 4E' ? 0 : 2
  const coordsAOI = missionData.polygon && missionData.polygon.coordinates && missionData.polygon.coordinates[0]
    ? generateValidPolygonCoordinates(missionData.polygon.coordinates[0])
    : ''
  const now = Date.now()

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${now}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${Math.max(1, Math.round(speed))}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>99</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${payloadEnumValue}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>${payloadSubEnumValue}</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>mapping2d</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>relativeToStartPoint</wpml:heightMode>
        <wpml:globalShootHeight>${altitude}</wpml:globalShootHeight>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${Math.round(speed)}</wpml:autoFlightSpeed>
      <Placemark>
        <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
        <wpml:elevationOptimizeEnable>0</wpml:elevationOptimizeEnable>
        <wpml:smartObliqueEnable>0</wpml:smartObliqueEnable>
        <wpml:quickOrthoMappingEnable>0</wpml:quickOrthoMappingEnable>
        <wpml:facadeWaylineEnable>0</wpml:facadeWaylineEnable>
        <wpml:isLookAtSceneSet>0</wpml:isLookAtSceneSet>
        <wpml:smartObliqueGimbalPitch>-45</wpml:smartObliqueGimbalPitch>
        <wpml:shootType>time</wpml:shootType>
        <wpml:direction>${optimalHeading}</wpml:direction>
        <wpml:margin>0</wpml:margin>
        <wpml:efficiencyFlightModeEnable>0</wpml:efficiencyFlightModeEnable>
        <wpml:overlap>
          <wpml:orthoLidarOverlapH>${frontOverlap}</wpml:orthoLidarOverlapH>
          <wpml:orthoLidarOverlapW>${sideOverlap}</wpml:orthoLidarOverlapW>
          <wpml:orthoCameraOverlapH>${frontOverlap}</wpml:orthoCameraOverlapH>
          <wpml:orthoCameraOverlapW>${sideOverlap}</wpml:orthoCameraOverlapW>
        </wpml:overlap>
        ${coordsAOI ? `
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
${coordsAOI}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>` : ''}
        <wpml:ellipsoidHeight>${altitude}</wpml:ellipsoidHeight>
        <wpml:height>${altitude}</wpml:height>
      </Placemark>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:dewarpingEnable>0</wpml:dewarpingEnable>
        <wpml:returnMode>singleReturnFirst</wpml:returnMode>
        <wpml:samplingRate>240000</wpml:samplingRate>
        <wpml:scanningMode>nonRepetitive</wpml:scanningMode>
        <wpml:modelColoringEnable>0</wpml:modelColoringEnable>
        <wpml:imageFormat>visable,ir</wpml:imageFormat>
      </wpml:payloadParam>
    </Folder>
  </Document>
</kml>`
}

// Public export for template KML (used by Standard KML button)
export function generateDJITemplateKML(flightPlan: FlightPlan, missionData: MissionData): string {
  return buildDJITemplateKML(flightPlan, missionData)
}

function buildDJIWPML(flightPlan: FlightPlan, missionData: MissionData): string {
  const altitude = Number(missionData.calculatedAltitude.toFixed(1))
  const speed = Number(missionData.parameters.droneSpeed)
  const optimalHeading = Math.round(flightPlan.optimalHeading || 0)
  const model = getDroneModelFromSpecs(missionData.droneSpecs)
  const payloadEnumValue = model === 'DJI Matrice 4E' ? 88 : 89
  const payloadSubEnumValue = model === 'DJI Matrice 4E' ? 0 : 2

  // Flatten all waypoints with indices
  const allWaypoints = flattenWaypoints(flightPlan)

  // Build KML container with DJI wpml tags per Placemark, matching Pilot 2 reference
  const placemarks = allWaypoints.map((wp, idx) => `
    <Placemark>
      <Point><coordinates>${wp.lng},${wp.lat}</coordinates></Point>
      <wpml:index>${idx}</wpml:index>
      <wpml:executeHeight>${altitude}</wpml:executeHeight>
      <wpml:waypointSpeed>${speed.toFixed(2)}</wpml:waypointSpeed>
      <wpml:waypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>${optimalHeading}</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
      </wpml:waypointHeadingParam>
      <wpml:actionGroup>
        <wpml:actionGroupId>1</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
        <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>1</wpml:actionId>
          <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>
    </Placemark>`).join('')

  const extended = buildParametersExtendedData(flightPlan, missionData)

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <name>DJI Waylines</name>
    ${extended}
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${Math.max(1, speed).toFixed(0)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo><wpml:droneEnumValue>99</wpml:droneEnumValue><wpml:droneSubEnumValue>0</wpml:droneSubEnumValue></wpml:droneInfo>
      <wpml:payloadInfo><wpml:payloadEnumValue>${payloadEnumValue}</wpml:payloadEnumValue><wpml:payloadSubEnumValue>${payloadSubEnumValue}</wpml:payloadSubEnumValue><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:payloadInfo>
    </wpml:missionConfig>
    <wpml:payloadConfig>
      <wpml:payload>
        <wpml:payloadType>camera</wpml:payloadType>
        <wpml:payloadIndex>0</wpml:payloadIndex>
      </wpml:payload>
    </wpml:payloadConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:autoFlightSpeed>${speed.toFixed(0)}</wpml:autoFlightSpeed>
      ${placemarks}
    </Folder>
  </Document>
</kml>`
}

// Build a PURE WPML (no KML wrapper) for missions.wpml export
function buildDJIWPMLPure(flightPlan: FlightPlan, missionData: MissionData): string {
  const altitude = Number(missionData.calculatedAltitude.toFixed(1))
  const speed = Number(missionData.parameters.droneSpeed)
  const optimalHeading = Math.round(flightPlan.optimalHeading || 0)
  const model = getDroneModelFromSpecs(missionData.droneSpecs)
  const payloadEnumValue = model === 'DJI Matrice 4E' ? 88 : 89
  const payloadSubEnumValue = model === 'DJI Matrice 4E' ? 0 : 2

  const allWaypoints = flattenWaypoints(flightPlan)

  const waypointsXml = allWaypoints.map((wp, idx) => `
    <wpml:waypoint>
      <wpml:index>${idx}</wpml:index>
      <wpml:executeHeight>${altitude}</wpml:executeHeight>
      <wpml:coordinate>${wp.lng},${wp.lat}</wpml:coordinate>
      <wpml:waypointSpeed>${speed.toFixed(2)}</wpml:waypointSpeed>
      <wpml:waypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>${optimalHeading}</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
      </wpml:waypointHeadingParam>
      <wpml:actionGroup>
        <wpml:actionGroupId>1</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>${idx}</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>${idx}</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
        </wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
            <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
            <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
            <wpml:gimbalPitchRotateAngle>-90</wpml:gimbalPitchRotateAngle>
            <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
            <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
            <wpml:gimbalRotateTime>10</wpml:gimbalRotateTime>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
        <wpml:action>
          <wpml:actionId>1</wpml:actionId>
          <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>
    </wpml:waypoint>`).join('')

  const extended = buildParametersExtendedData(flightPlan, missionData)

  return `<?xml version="1.0" encoding="UTF-8"?>
<wpml:Waylines xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <!-- Parameters (non-standard metadata block carried over) -->
  ${extended}
  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>goHome</wpml:finishAction>
    <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
    <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
    <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
    <wpml:globalTransitionalSpeed>${Math.max(1, speed).toFixed(0)}</wpml:globalTransitionalSpeed>
    <wpml:droneInfo>
      <wpml:droneEnumValue>99</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
    </wpml:droneInfo>
    <wpml:payloadInfo>
      <wpml:payloadEnumValue>${payloadEnumValue}</wpml:payloadEnumValue>
      <wpml:payloadSubEnumValue>${payloadSubEnumValue}</wpml:payloadSubEnumValue>
      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
    </wpml:payloadInfo>
  </wpml:missionConfig>
  <wpml:payloadConfig>
    <wpml:payload>
      <wpml:payloadType>camera</wpml:payloadType>
      <wpml:payloadIndex>0</wpml:payloadIndex>
    </wpml:payload>
  </wpml:payloadConfig>
  <wpml:wayline>
    <wpml:templateId>0</wpml:templateId>
    <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
    <wpml:waylineId>0</wpml:waylineId>
    <wpml:autoFlightSpeed>${speed.toFixed(0)}</wpml:autoFlightSpeed>
    <wpml:waypointList>
      ${waypointsXml}
    </wpml:waypointList>
  </wpml:wayline>
</wpml:Waylines>`
}

function buildParametersExtendedData(flightPlan: FlightPlan, missionData: MissionData): string {
  const params = missionData.parameters
  const specs = missionData.droneSpecs
  const droneModel = getDroneModelFromSpecs(specs)
  const heading = flightPlan.optimalHeading
  return `
    <ExtendedData>
      <Data name="planType"><value>Survey Mission</value></Data>
      <Data name="gsd_cm"><value>${params.gsd}</value></Data>
      <Data name="altitude_agl_m"><value>${missionData.calculatedAltitude.toFixed(1)}</value></Data>
      <Data name="heading_deg"><value>${heading}</value></Data>
      <Data name="speed_mps"><value>${params.droneSpeed}</value></Data>
      <Data name="frontOverlap_pct"><value>${params.frontOverlap}</value></Data>
      <Data name="sideOverlap_pct"><value>${params.sideOverlap}</value></Data>
      <Data name="droneModel"><value>${droneModel}</value></Data>
      <Data name="sensor_mm"><value>${specs.sensor.width}x${specs.sensor.height}</value></Data>
      <Data name="focalLength_mm"><value>${specs.focalLength}</value></Data>
      <Data name="image_px"><value>${specs.imageDimensions.width}x${specs.imageDimensions.height}</value></Data>
      ${params.manualHeading ? `<Data name="manualHeading"><value>${params.customHeading ?? 0}</value></Data>` : ''}
    </ExtendedData>`
}

function flattenWaypoints(flightPlan: FlightPlan): Array<{ lng: number; lat: number }> {
  const list: Array<{ lng: number; lat: number }> = []
  for (const mission of flightPlan.missions) {
    for (const line of mission.flightLines) {
      for (const c of line.coordinates) {
        list.push({ lng: c.lng, lat: c.lat })
      }
    }
  }
  return list
}

function estimatePhotoDistanceMeters(missionData: MissionData): number {
  // Use the exact same formula as flight plan generation for perfect parity
  return calculatePhotoInterval(
    missionData.parameters.gsd,
    missionData.droneSpecs.imageDimensions.height,
    missionData.parameters.frontOverlap
  )
}

// Generate comprehensive drone-specific KML export
export function generateDroneSpecificKML(flightPlan: FlightPlan, missionData: MissionData): string {
  const currentDate = new Date().toISOString().split('T')[0]
  
  // Determine drone model from specs
  const droneModel = getDroneModelFromSpecs(missionData.droneSpecs)
  const droneMetadata = getDroneMetadata(droneModel, missionData.droneSpecs)
  
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:dji="http://www.dji.com/kml/ext/2.2">
  <Document>
    <name>🔒 LOCKED ${droneModel} Survey Mission - ${currentDate}</name>
    <description>
      ⚠️ FLIGHT PLAN LOCKED - READ ONLY ⚠️
      Generated by Droner Mission Planner
      Optimized for ${droneModel}
      
      🚫 NOTICE: This flight plan is LOCKED and cannot be modified.
      Any changes to altitude, speed, or waypoints may compromise mission objectives.
      Contact mission planner before making modifications.
      
      Flight Parameters:
      - Ground Sample Distance: ${missionData.parameters.gsd} cm/px
      - Flight Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL (LOCKED)
      - Front Overlap: ${missionData.parameters.frontOverlap}%
      - Side Overlap: ${missionData.parameters.sideOverlap}%
      - Drone Speed: ${missionData.parameters.droneSpeed} m/s
      - Total Flight Time: ${flightPlan.totalTime.toFixed(1)} minutes
      - Total Photos: ${flightPlan.totalPhotos}
      - Number of Missions: ${flightPlan.missions.length}
      
      Drone Specifications:
      - Model: ${droneModel}
      - Camera: ${droneMetadata.cameraModel}
      - Sensor: ${missionData.droneSpecs.sensor.width}×${missionData.droneSpecs.sensor.height}mm
      - Focal Length: ${missionData.droneSpecs.focalLength}mm
      - Image Resolution: ${missionData.droneSpecs.imageDimensions.width}×${missionData.droneSpecs.imageDimensions.height}px
      - Photo Interval: ${missionData.droneSpecs.minPhotoInterval}s minimum
      - Battery Life: ${missionData.droneSpecs.usableBatteryTime} minutes
      
      🔐 MISSION INTEGRITY NOTICE:
      This mission has been calculated for optimal coverage and accuracy.
      Modifying altitude will affect Ground Sample Distance (GSD).
      Changing speed may impact photo overlap and image quality.
      Waypoint modifications could create coverage gaps.
    </description>
    
    <!-- Comprehensive Drone-Specific Metadata -->
    <ExtendedData>
      <!-- Mission Parameters -->
      <Data name="planType">
        <value>Survey Mission</value>
      </Data>
      <Data name="gsd">
        <value>${missionData.parameters.gsd}</value>
      </Data>
      <Data name="altitude">
        <value>${missionData.calculatedAltitude.toFixed(1)}</value>
      </Data>
      <Data name="altitudeMode">
        <value>AGL</value>
      </Data>
      <Data name="altitudeAGL">
        <value>${missionData.calculatedAltitude.toFixed(1)}</value>
      </Data>
      <Data name="altitudeMSL">
        <value>${(missionData.calculatedAltitude + 50).toFixed(1)}</value>
      </Data>
      <Data name="altitudeReference">
        <value>ground</value>
      </Data>
      <Data name="heading">
        <value>${flightPlan.optimalHeading}</value>
      </Data>
      <Data name="speed">
        <value>${missionData.parameters.droneSpeed}</value>
      </Data>
      <Data name="frontOverlap">
        <value>${missionData.parameters.frontOverlap}</value>
      </Data>
      <Data name="sideOverlap">
        <value>${missionData.parameters.sideOverlap}</value>
      </Data>
      
      <!-- DroneDeploy Specific Altitude Settings -->
      <Data name="dd:flightAltitude">
        <value>${missionData.calculatedAltitude.toFixed(1)}</value>
      </Data>
      <Data name="dd:altitudeType">
        <value>agl</value>
      </Data>
      <Data name="dd:terrainFollowing">
        <value>true</value>
      </Data>
      <Data name="dd:baseElevation">
        <value>0</value>
      </Data>
      
      <!-- Flight Plan Locking -->
      <Data name="missionLocked">
        <value>true</value>
      </Data>
      <Data name="editingPermissions">
        <value>readonly</value>
      </Data>
      <Data name="allowModifications">
        <value>false</value>
      </Data>
      <Data name="lockedBy">
        <value>Droner Mission Planner</value>
      </Data>
      <Data name="lockTimestamp">
        <value>${new Date().toISOString()}</value>
      </Data>
      
      <!-- Drone Hardware Specifications -->
      <Data name="droneModel">
        <value>${droneModel}</value>
      </Data>
      <Data name="droneManufacturer">
        <value>DJI</value>
      </Data>
      <Data name="cameraModel">
        <value>${droneMetadata.cameraModel}</value>
      </Data>
      <Data name="sensorWidth">
        <value>${missionData.droneSpecs.sensor.width}</value>
      </Data>
      <Data name="sensorHeight">
        <value>${missionData.droneSpecs.sensor.height}</value>
      </Data>
      <Data name="focalLength">
        <value>${missionData.droneSpecs.focalLength}</value>
      </Data>
      <Data name="imageWidth">
        <value>${missionData.droneSpecs.imageDimensions.width}</value>
      </Data>
      <Data name="imageHeight">
        <value>${missionData.droneSpecs.imageDimensions.height}</value>
      </Data>
      <Data name="photoInterval">
        <value>${missionData.droneSpecs.minPhotoInterval}</value>
      </Data>
      <Data name="batteryLife">
        <value>${missionData.droneSpecs.usableBatteryTime}</value>
      </Data>
      
      <!-- Camera & Gimbal Settings -->
      <Data name="gimbalMode">
        <value>FPV</value>
      </Data>
      <Data name="gimbalPitchMode">
        <value>manual</value>
      </Data>
      <Data name="gimbalPitch">
        <value>-90</value>
      </Data>
      <Data name="cameraMode">
        <value>photo</value>
      </Data>
      <Data name="photoMode">
        <value>single</value>
      </Data>
      <Data name="exposureMode">
        <value>auto</value>
      </Data>
      <Data name="focusMode">
        <value>auto</value>
      </Data>
      <Data name="meteringMode">
        <value>center</value>
      </Data>
      <Data name="whiteBalanceMode">
        <value>auto</value>
      </Data>
      
      <!-- Flight Control Settings -->
      <Data name="flightMode">
        <value>waypoint</value>
      </Data>
      <Data name="rcLostAction">
        <value>returnToHome</value>
      </Data>
      <Data name="lowBatteryAction">
        <value>returnToHome</value>
      </Data>
      <Data name="obstacleAvoidance">
        <value>enabled</value>
      </Data>
      <Data name="precisionLanding">
        <value>enabled</value>
      </Data>
      
      <!-- DJI-Specific Parameters -->
      <Data name="dji:aircraftModel">
        <value>${droneMetadata.djiModelCode}</value>
      </Data>
      <Data name="dji:cameraType">
        <value>${droneMetadata.djiCameraCode}</value>
      </Data>
      <Data name="dji:gimbalType">
        <value>${droneMetadata.djiGimbalCode}</value>
      </Data>
      <Data name="dji:maxFlightSpeed">
        <value>${droneMetadata.maxSpeed}</value>
      </Data>
      <Data name="dji:maxWindResistance">
        <value>${droneMetadata.maxWind}</value>
      </Data>
      <Data name="dji:operatingFrequency">
        <value>${droneMetadata.frequency}</value>
      </Data>
      
      <!-- Generator Information -->
      <Data name="generator">
        <value>Droner Mission Planner</value>
      </Data>
      <Data name="generatorVersion">
        <value>1.0.0</value>
      </Data>
      <Data name="creationDate">
        <value>${currentDate}</value>
      </Data>
      <Data name="coordinateSystem">
        <value>WGS84</value>
      </Data>
    </ExtendedData>
    
    <!-- Area of Interest -->
    <Placemark>
      <name>Survey Area</name>
      <description>Area of Interest boundary - ${(flightPlan.totalArea / 4046.86).toFixed(2)} acres</description>
      <Style>
        <PolyStyle>
          <color>7f3b82f6</color>
          <outline>1</outline>
        </PolyStyle>
        <LineStyle>
          <color>ff1d4ed8</color>
          <width>2</width>
        </LineStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${missionData.polygon.coordinates[0].map(coord => `${coord.lng},${coord.lat},0`).join('\n              ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`

  const missionFolders = flightPlan.missions.map((mission, index) => {
    const missionColor = mission.color.replace('#', '')
    const kmlColor = `ff${missionColor.slice(4, 6)}${missionColor.slice(2, 4)}${missionColor.slice(0, 2)}` // Convert RGB to BGR and add alpha
    
    return `
    <!-- Mission ${index + 1} -->
    <Folder>
      <name>Mission ${index + 1} - Battery ${index + 1}</name>
      <description>
        Estimated Time: ${mission.estimatedTime.toFixed(1)} minutes
        Estimated Photos: ${mission.estimatedPhotos}
        Flight Lines: ${mission.flightLines.length}
        
        Instructions:
        1. Load fresh battery
        2. Verify GPS signal strength
        3. Check camera settings
        4. Start mission at takeoff point
      </description>
      
      <!-- Mission Start Point -->
      ${mission.startPoint ? `
      <Placemark>
        <name>Mission ${index + 1} - Start</name>
        <description>Takeoff and mission start point</description>
        <Style>
          <IconStyle>
            <scale>1.2</scale>
            <Icon>
              <href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href>
            </Icon>
          </IconStyle>
        </Style>
        <Point>
          <coordinates>${mission.startPoint.lng},${mission.startPoint.lat},${missionData.calculatedAltitude}</coordinates>
        </Point>
      </Placemark>` : ''}
      
      <!-- Flight Lines with Waypoints -->
      ${mission.flightLines.map((flightLine, lineIndex) => 
        generateDroneSpecificFlightLine(flightLine, lineIndex, missionData, droneModel, droneMetadata, index, kmlColor)
      ).join('')}
      
      <!-- Mission End Point -->
      ${mission.endPoint ? `
      <Placemark>
        <name>Mission ${index + 1} - End</name>
        <description>Mission end point and landing location</description>
        <Style>
          <IconStyle>
            <scale>1.2</scale>
            <Icon>
              <href>http://maps.google.com/mapfiles/kml/shapes/target.png</href>
            </Icon>
          </IconStyle>
        </Style>
        <Point>
          <coordinates>${mission.endPoint.lng},${mission.endPoint.lat},${missionData.calculatedAltitude}</coordinates>
        </Point>
      </Placemark>` : ''}
    </Folder>`
  }).join('')

  const kmlFooter = `
  </Document>
</kml>`

  return kmlHeader + missionFolders + kmlFooter
}

// Generate DJI-compatible waypoint mission KML
export function generateDJIWaypointKML(flightPlan: FlightPlan, missionData: MissionData): string {
  const currentDate = new Date().toISOString().split('T')[0]
  
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>DJI Waypoint Mission - ${currentDate}</name>
    <description>
      DJI-compatible waypoint mission
      Generated by Droner Mission Planner
      
      Flight Parameters:
      - Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
      - Speed: ${missionData.parameters.droneSpeed} m/s
      - Total Waypoints: ${flightPlan.missions.reduce((total, mission) => total + mission.flightLines.reduce((lineTotal, line) => lineTotal + line.coordinates.length, 0), 0)}
      - Photo Interval: ${(missionData.parameters.gsd * missionData.droneSpecs.imageDimensions.height / 100 * (1 - missionData.parameters.frontOverlap / 100)).toFixed(1)}m
    </description>`

  // Generate waypoint missions for each battery
  const waypointMissions = flightPlan.missions.map((mission, missionIndex) => {
    let waypointCounter = 1
    
    const waypoints = mission.flightLines.map((flightLine, lineIndex) => {
      return flightLine.coordinates.map((coord, coordIndex) => {
        const isFirstWaypoint = lineIndex === 0 && coordIndex === 0
        const isLastWaypoint = lineIndex === mission.flightLines.length - 1 && coordIndex === flightLine.coordinates.length - 1
        
        return `
    <Placemark>
      <name>WP${waypointCounter++}</name>
      <description>
        Mission: ${missionIndex + 1}
        Line: ${lineIndex + 1}
        Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
        Speed: ${missionData.parameters.droneSpeed} m/s
        ${isFirstWaypoint ? 'Action: Take Photo, Start Mission' : ''}
        ${isLastWaypoint ? 'Action: Take Photo, End Mission' : 'Action: Take Photo'}
        Heading: ${flightLine.heading.toFixed(0)}°
      </description>
      <ExtendedData>
        <Data name="waypointIndex">
          <value>${waypointCounter - 1}</value>
        </Data>
        <Data name="altitude">
          <value>${missionData.calculatedAltitude.toFixed(1)}</value>
        </Data>
        <Data name="speed">
          <value>${missionData.parameters.droneSpeed}</value>
        </Data>
        <Data name="heading">
          <value>${flightLine.heading}</value>
        </Data>
        <Data name="gimbalPitch">
          <value>-90</value>
        </Data>
        <Data name="action">
          <value>takePhoto</value>
        </Data>
      </ExtendedData>
      <Point>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${coord.lng},${coord.lat},${missionData.calculatedAltitude}</coordinates>
      </Point>
    </Placemark>`
      }).join('')
    }).join('')

    return `
    <Folder>
      <name>Waypoint Mission ${missionIndex + 1}</name>
      <description>
        Battery ${missionIndex + 1} mission
        Estimated Time: ${mission.estimatedTime.toFixed(1)} minutes
        Estimated Photos: ${mission.estimatedPhotos}
        
        DJI Flight Instructions:
        1. Load mission into DJI Pilot or GS Pro
        2. Verify altitude is set to AGL (Above Ground Level)
        3. Check camera is set to auto-capture
        4. Ensure sufficient battery for ${mission.estimatedTime.toFixed(1)} minute flight
        5. Verify GPS signal strength before takeoff
      </description>
      ${waypoints}
    </Folder>`
  }).join('')

  const kmlFooter = `
  </Document>
</kml>`

  return kmlHeader + waypointMissions + kmlFooter
}

// Generate separate KML files for multi-drone operations
export function generateMultiDroneKMLs(flightPlan: FlightPlan, missionData: MissionData): {
  droneA: string,
  droneB: string,
  coordinationData: string
} {
  // Split missions between two drones for parallel operations
  const droneAMissions: Mission[] = []
  const droneBMissions: Mission[] = []
  
  // Strategy: Alternate missions for parallel battery usage
  flightPlan.missions.forEach((mission, index) => {
    if (index % 2 === 0) {
      droneAMissions.push({
        ...mission,
        id: `droneA-mission-${Math.floor(index / 2) + 1}`,
        index: Math.floor(index / 2)
      })
    } else {
      droneBMissions.push({
        ...mission,
        id: `droneB-mission-${Math.floor(index / 2) + 1}`,
        index: Math.floor(index / 2)
      })
    }
  })

  // Calculate timing for coordination
  const droneATime = droneAMissions.reduce((sum, m) => sum + m.estimatedTime, 0)
  const droneBTime = droneBMissions.reduce((sum, m) => sum + m.estimatedTime, 0)
  const totalPhotosA = droneAMissions.reduce((sum, m) => sum + m.estimatedPhotos, 0)
  const totalPhotosB = droneBMissions.reduce((sum, m) => sum + m.estimatedPhotos, 0)

  // Generate Drone A KML
  const droneAFlightPlan: FlightPlan = {
    missions: droneAMissions,
    totalTime: droneATime,
    totalPhotos: totalPhotosA,
    totalArea: flightPlan.totalArea,
    batteryCount: droneAMissions.length,
    optimalHeading: flightPlan.optimalHeading
  }

  // Generate Drone B KML  
  const droneBFlightPlan: FlightPlan = {
    missions: droneBMissions,
    totalTime: droneBTime,
    totalPhotos: totalPhotosB,
    totalArea: flightPlan.totalArea,
    batteryCount: droneBMissions.length,
    optimalHeading: flightPlan.optimalHeading
  }

  const currentDate = new Date().toISOString().split('T')[0]

  // Enhanced KML for Drone A
  const droneAKML = generateEnhancedDroneKML(droneAFlightPlan, missionData, 'A', currentDate)
  
  // Enhanced KML for Drone B
  const droneBKML = generateEnhancedDroneKML(droneBFlightPlan, missionData, 'B', currentDate)

  // Coordination data
  const coordinationData = generateCoordinationDocument(
    droneAFlightPlan, 
    droneBFlightPlan, 
    missionData,
    currentDate
  )

  return {
    droneA: droneAKML,
    droneB: droneBKML,
    coordinationData
  }
}

// Generate enhanced KML for specific drone
function generateEnhancedDroneKML(
  flightPlan: FlightPlan, 
  missionData: MissionData, 
  droneId: string,
  currentDate: string
): string {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Drone ${droneId} Flight Plan - ${currentDate}</name>
    <description>
      Multi-Drone Mission - Drone ${droneId}
      Generated by Droner Mission Planner
      
      Flight Parameters:
      - Ground Sample Distance: ${missionData.parameters.gsd} cm/px
      - Flight Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
      - Drone Speed: ${missionData.parameters.droneSpeed} m/s
      - Total Flight Time: ${flightPlan.totalTime.toFixed(1)} minutes
      - Total Photos: ${flightPlan.totalPhotos}
      - Number of Batteries: ${flightPlan.missions.length}
      
      Multi-Drone Coordination:
      - This is Drone ${droneId} of a 2-drone operation
      - Coordinate takeoff timing with Drone ${droneId === 'A' ? 'B' : 'A'}
      - Maintain visual line of sight between operators
      - Use separate radio frequencies to avoid interference
    </description>
    
    <!-- Drone-specific metadata -->
    <ExtendedData>
      <Data name="droneId">
        <value>${droneId}</value>
      </Data>
      <Data name="operationType">
        <value>Multi-Drone Survey</value>
      </Data>
      <Data name="coordinationRequired">
        <value>true</value>
      </Data>
      <Data name="partnerDrone">
        <value>Drone ${droneId === 'A' ? 'B' : 'A'}</value>
      </Data>
    </ExtendedData>
    
    <!-- Survey Area Reference -->
    <Placemark>
      <name>Survey Area - Drone ${droneId} Coverage</name>
      <description>Total survey area - Drone ${droneId} will cover missions ${flightPlan.missions.map(m => m.index + 1).join(', ')}</description>
      <Style>
        <PolyStyle>
          <color>7f${droneId === 'A' ? '3b82f6' : 'f97316'}</color>
          <outline>1</outline>
        </PolyStyle>
        <LineStyle>
          <color>ff${droneId === 'A' ? '1d4ed8' : 'ea580c'}</color>
          <width>2</width>
        </LineStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${missionData.polygon.coordinates[0].map(coord => `${coord.lng},${coord.lat},0`).join('\n              ')}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`

  const missionFolders = flightPlan.missions.map((mission, index) => {
    const missionColor = droneId === 'A' ? '#3b82f6' : '#f97316' // Blue for A, Orange for B
    const kmlColor = droneId === 'A' ? 'ff3b82f6' : 'fff97316'
    
    return `
    <!-- Drone ${droneId} Mission ${index + 1} -->
    <Folder>
      <name>Drone ${droneId} - Mission ${index + 1}</name>
      <description>
        Battery Mission ${index + 1} for Drone ${droneId}
        Estimated Time: ${mission.estimatedTime.toFixed(1)} minutes
        Estimated Photos: ${mission.estimatedPhotos}
        Flight Lines: ${mission.flightLines.length}
        
        Coordination Notes:
        - Start this mission when Drone ${droneId === 'A' ? 'B' : 'A'} begins its Mission ${index + 1}
        - Maintain minimum 150m separation between drones
        - Monitor radio communications on designated frequency
        - Report completion to coordination team
      </description>
      
      <!-- Mission Start Point -->
      ${mission.startPoint ? `
      <Placemark>
        <name>Drone ${droneId} M${index + 1} - Start</name>
        <description>Takeoff point for Drone ${droneId}, Mission ${index + 1}</description>
        <Style>
          <IconStyle>
            <scale>1.3</scale>
            <Icon>
              <href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href>
            </Icon>
            <color>${kmlColor}</color>
          </IconStyle>
          <LabelStyle>
            <scale>1.1</scale>
            <color>${kmlColor}</color>
          </LabelStyle>
        </Style>
        <Point>
          <coordinates>${mission.startPoint.lng},${mission.startPoint.lat},${missionData.calculatedAltitude}</coordinates>
        </Point>
      </Placemark>` : ''}
      
      <!-- Flight Lines -->
      ${mission.flightLines.map((flightLine, lineIndex) => `
      <Placemark>
        <name>Drone ${droneId} - Line ${lineIndex + 1}</name>
        <description>
          Drone: ${droneId}
          Mission: ${index + 1}
          Line: ${lineIndex + 1}
          Heading: ${flightLine.heading.toFixed(0)}°
          Length: ${flightLine.length.toFixed(1)}m
          Estimated Photos: ${Math.ceil(flightLine.length / (missionData.parameters.gsd * missionData.droneSpecs.imageDimensions.height / 100 * (1 - missionData.parameters.frontOverlap / 100)))}
        </description>
        <Style>
          <LineStyle>
            <color>${kmlColor}</color>
            <width>4</width>
          </LineStyle>
        </Style>
        <LineString>
          <altitudeMode>absolute</altitudeMode>
          <coordinates>
            ${flightLine.coordinates.map(coord => `${coord.lng},${coord.lat},${missionData.calculatedAltitude}`).join('\n            ')}
          </coordinates>
        </LineString>
      </Placemark>`).join('')}
    </Folder>`
  }).join('')

  const kmlFooter = `
  </Document>
</kml>`

  return kmlHeader + missionFolders + kmlFooter
}

// Generate coordination document
function generateCoordinationDocument(
  droneAFlightPlan: FlightPlan,
  droneBFlightPlan: FlightPlan,
  missionData: MissionData,
  currentDate: string
): string {
  return `
MULTI-DRONE SURVEY COORDINATION PLAN
Generated: ${currentDate}
Generated by: Droner Mission Planner

===========================================
MISSION OVERVIEW
===========================================
Survey Area: ${(droneAFlightPlan.totalArea / 4046.86).toFixed(2)} acres
Total Flight Time: ${Math.max(droneAFlightPlan.totalTime, droneBFlightPlan.totalTime).toFixed(1)} minutes
Total Photos: ${droneAFlightPlan.totalPhotos + droneBFlightPlan.totalPhotos}
Coordination Type: Parallel Battery Missions

===========================================
DRONE ASSIGNMENTS
===========================================

DRONE A:
- Missions: ${droneAFlightPlan.missions.map((_, i) => i + 1).join(', ')}
- Flight Time: ${droneAFlightPlan.totalTime.toFixed(1)} minutes
- Photos: ${droneAFlightPlan.totalPhotos}
- Batteries: ${droneAFlightPlan.batteryCount}

DRONE B:
- Missions: ${droneBFlightPlan.missions.map((_, i) => i + 1).join(', ')}
- Flight Time: ${droneBFlightPlan.totalTime.toFixed(1)} minutes
- Photos: ${droneBFlightPlan.totalPhotos}
- Batteries: ${droneBFlightPlan.batteryCount}

===========================================
TIMING COORDINATION
===========================================

Phase 1: Initial Missions
- Drone A: Mission 1 (${droneAFlightPlan.missions[0]?.estimatedTime.toFixed(1) || 'N/A'} min)
- Drone B: Mission 1 (${droneBFlightPlan.missions[0]?.estimatedTime.toFixed(1) || 'N/A'} min)
- Start: Synchronized takeoff
- End: Both drones return for battery change

Phase 2: Secondary Missions  
- Drone A: Mission 2 (${droneAFlightPlan.missions[1]?.estimatedTime.toFixed(1) || 'N/A'} min)
- Drone B: Mission 2 (${droneBFlightPlan.missions[1]?.estimatedTime.toFixed(1) || 'N/A'} min)
- Start: After battery changes complete
- End: Survey completion

===========================================
SAFETY PROTOCOLS
===========================================

Pre-Flight:
□ Both pilots have visual contact
□ Radio frequencies assigned and tested
□ Separate controller channels verified
□ Emergency landing zones identified
□ Weather conditions acceptable for both drones

During Flight:
□ Maintain minimum 150m horizontal separation
□ Continuous radio communication between pilots
□ Monitor both drones' battery levels
□ Coordinate any route deviations
□ Report any anomalies immediately

Emergency Procedures:
□ If one drone fails, immediately land the other
□ Emergency landing sites pre-identified
□ Contact information for local authorities
□ Backup equipment ready for deployment

===========================================
DRONEDEPLOY SETUP INSTRUCTIONS
===========================================

1. SEPARATE PROJECT METHOD:
   - Create "Project A - Drone A" in DroneDeploy
   - Import drone-a-flight-plan.kml
   - Create "Project B - Drone B" in DroneDeploy  
   - Import drone-b-flight-plan.kml
   - Assign different pilots to each project
   - Schedule coordinated start times

2. MISSION COORDINATION:
   - Set identical survey parameters in both projects
   - Use same GSD and overlap settings
   - Verify altitude consistency between projects
   - Test import success before field deployment

===========================================
EQUIPMENT CHECKLIST
===========================================

DRONE A:
□ DJI ${missionData.droneSpecs === undefined ? 'Phantom 4 Pro' : 'Matrice 4E'} ready
□ ${droneAFlightPlan.batteryCount} charged batteries
□ Controller with Drone A KML loaded
□ SD cards formatted and ready
□ Pilot certification documents

DRONE B:
□ DJI ${missionData.droneSpecs === undefined ? 'Phantom 4 Pro' : 'Matrice 4E'} ready  
□ ${droneBFlightPlan.batteryCount} charged batteries
□ Controller with Drone B KML loaded
□ SD cards formatted and ready
□ Pilot certification documents

SHARED:
□ Coordination radio equipment
□ Weather monitoring equipment
□ Emergency contact information
□ Backup landing sites mapped
□ First aid kit available

===========================================
POST-FLIGHT DATA MANAGEMENT
===========================================

Data Collection:
- Drone A photos: ${droneAFlightPlan.totalPhotos} images
- Drone B photos: ${droneBFlightPlan.totalPhotos} images
- Total dataset: ${droneAFlightPlan.totalPhotos + droneBFlightPlan.totalPhotos} images

DroneDeploy Processing:
1. Upload Drone A images to Project A
2. Upload Drone B images to Project B  
3. Process each project separately
4. Merge final orthomosaics in post-processing
5. Verify seamless coverage between drone areas

Quality Control:
□ Check overlap coverage between drone areas
□ Verify image quality and exposure consistency
□ Confirm GPS accuracy in both datasets
□ Review mission completion rates
□ Document any gaps or issues for future missions

===========================================
END OF COORDINATION PLAN
===========================================
`.trim()
}

export function generateCSVExport(flightPlan: FlightPlan, missionData: MissionData): string {
  const csvHeader = 'Mission,Line,Waypoint,Latitude,Longitude,Altitude,Heading,Notes\n'
  
  const csvRows: string[] = []
  
  flightPlan.missions.forEach((mission, missionIndex) => {
    mission.flightLines.forEach((flightLine, lineIndex) => {
      flightLine.coordinates.forEach((coord, waypointIndex) => {
        const row = [
          missionIndex + 1,
          lineIndex + 1,
          waypointIndex + 1,
          coord.lat.toFixed(6),
          coord.lng.toFixed(6),
          missionData.calculatedAltitude.toFixed(1),
          flightLine.heading.toFixed(1),
          `Mission ${missionIndex + 1}, Line ${lineIndex + 1}`
        ].join(',')
        
        csvRows.push(row)
      })
    })
  })
  
  return csvHeader + csvRows.join('\n')
}

export function generateFlightPlanSummary(flightPlan: FlightPlan, missionData: MissionData): string {
  const summary = `
DRONE MISSION PLAN SUMMARY
Generated by Droner Mission Planner

MISSION OVERVIEW:
- Total Area: ${(flightPlan.totalArea / 4046.86).toFixed(2)} acres
- Total Flight Time: ${flightPlan.totalTime.toFixed(1)} minutes
- Number of Batteries: ${flightPlan.batteryCount}
- Total Photos: ${flightPlan.totalPhotos}
- Optimal Flight Heading: ${flightPlan.optimalHeading.toFixed(0)}°

FLIGHT PARAMETERS:
- Ground Sample Distance: ${missionData.parameters.gsd} cm/px
- Flight Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
- Front Overlap: ${missionData.parameters.frontOverlap}%
- Side Overlap: ${missionData.parameters.sideOverlap}%
- Drone Speed: ${missionData.parameters.droneSpeed} m/s
- Max Battery Time: ${missionData.parameters.maxBatteryTime} minutes

MISSION BREAKDOWN:
${flightPlan.missions.map((mission, index) => `
Mission ${index + 1}:
- Estimated Time: ${mission.estimatedTime.toFixed(1)} minutes
- Estimated Photos: ${mission.estimatedPhotos}
- Flight Lines: ${mission.flightLines.length}
- Color: ${mission.color}`).join('\n')}

DRONE SPECIFICATIONS:
- Model: DJI Phantom 4 Pro
- Sensor: ${missionData.droneSpecs.sensor.width}×${missionData.droneSpecs.sensor.height}mm
- Focal Length: ${missionData.droneSpecs.focalLength}mm
- Image Resolution: ${missionData.droneSpecs.imageDimensions.width}×${missionData.droneSpecs.imageDimensions.height}px
- Minimum Photo Interval: ${missionData.droneSpecs.minPhotoInterval} seconds
- Usable Battery Time: ${missionData.droneSpecs.usableBatteryTime} minutes

NOTES:
- Flight plan assumes constant altitude (flat earth model)
- Turn time penalties are included in mission time calculations
- Each mission is optimized to fit within battery constraints
- Flight lines are generated with optimal spacing for coverage
`
  
  return summary.trim()
}

// Generate valid polygon coordinates ensuring closure and minimum points
function generateValidPolygonCoordinates(coordinates: any[]): string {
  if (!coordinates || coordinates.length < 3) {
    // Fallback: create a minimal square if no valid coordinates
    return `0,0,0
0,0.001,0
0.001,0.001,0
0.001,0,0
0,0,0`
  }
  
  // Normalize to {lng,lat}
  const normalized: Array<{ lng: number; lat: number }> = coordinates.map((coord: any) => {
    if (coord && typeof coord === 'object') {
      if (typeof coord.lng === 'number' && typeof coord.lat === 'number') {
        return { lng: coord.lng, lat: coord.lat }
      }
      // GeoJSON-like array [lng, lat]
      if (Array.isArray(coord) && coord.length >= 2) {
        const lng = Number(coord[0])
        const lat = Number(coord[1])
        return { lng, lat }
      }
    }
    return { lng: NaN, lat: NaN }
  }).filter(c => Number.isFinite(c.lng) && Number.isFinite(c.lat))

  if (normalized.length < 3) {
    // Fallback: minimal triangle near first valid or origin
    const first = normalized[0] ?? { lng: 0, lat: 0 }
    return `${first.lng},${first.lat},0
${first.lng + 0.001},${first.lat},0
${first.lng},${first.lat + 0.001},0
${first.lng},${first.lat},0`
  }

  // Ensure we have at least 3 unique coordinates
  const validCoords = normalized.filter((coord, index, arr) => {
    if (index === 0) return true
    const prev = arr[index - 1]
    return coord.lng !== prev.lng || coord.lat !== prev.lat
  })
  
  if (validCoords.length < 3) {
    // Fallback: create a minimal triangle if not enough unique coordinates
    const first = validCoords[0] || { lng: 0, lat: 0 }
    return `${first.lng},${first.lat},0
${first.lng + 0.001},${first.lat},0
${first.lng},${first.lat + 0.001},0
${first.lng},${first.lat},0`
  }
  
  // Format coordinates properly
  let coordString = validCoords.map(coord => `${coord.lng},${coord.lat},0`).join('\n              ')
  
  // Ensure polygon is closed (first and last coordinates are the same)
  const firstCoord = validCoords[0]
  const lastCoord = validCoords[validCoords.length - 1]
  
  if (firstCoord.lng !== lastCoord.lng || firstCoord.lat !== lastCoord.lat) {
    coordString += `\n              ${firstCoord.lng},${firstCoord.lat},0`
  }
  
  return coordString
}

// Determine drone model from specifications
function getDroneModelFromSpecs(droneSpecs: any): string {
  // Tolerant matching to handle spec variations
  const approx = (a: number, b: number, eps: number = 0.5) => Math.abs(a - b) <= eps

  // Phantom 4 Pro
  if (
    approx(droneSpecs.sensor.width, 13.2) &&
    approx(droneSpecs.sensor.height, 8.8) &&
    approx(droneSpecs.focalLength, 8.8)
  ) {
    return "DJI Phantom 4 Pro"
  }

  // Matrice 4E: identify primarily by sensor width or known image dimension
  if (
    approx(droneSpecs.sensor.width, 17.3) ||
    droneSpecs.imageDimensions?.width === 5280 ||
    approx(droneSpecs.focalLength, 24, 1.0) || // accept 24±1 when used
    approx(droneSpecs.focalLength, 12.19, 1.0) // accept calibrated effective focal
  ) {
    return "DJI Matrice 4E"
  }

  // Fallback
  return "DJI Phantom 4 Pro"
}

// Generate drone-specific flight line with waypoints and camera triggers
function generateDroneSpecificFlightLine(
  flightLine: any, 
  lineIndex: number, 
  missionData: any, 
  droneModel: string, 
  droneMetadata: any, 
  missionIndex: number, 
  kmlColor: string
): string {
  const photoInterval = (missionData.parameters.gsd * missionData.droneSpecs.imageDimensions.height / 100 * (1 - missionData.parameters.frontOverlap / 100))
  const estimatedPhotos = Math.ceil(flightLine.length / photoInterval)
  
  // Generate waypoints with camera triggers
  const waypoints = flightLine.coordinates.map((coord: any, waypointIndex: number) => {
    const isFirstWaypoint = waypointIndex === 0
    const isLastWaypoint = waypointIndex === flightLine.coordinates.length - 1
    
    return `
    <Placemark>
      <name>WP${missionIndex + 1}-${lineIndex + 1}-${waypointIndex + 1}</name>
      <description>
        Mission: ${missionIndex + 1}
        Line: ${lineIndex + 1}
        Waypoint: ${waypointIndex + 1}
        Action: ${isFirstWaypoint ? 'Start Line + Photo' : isLastWaypoint ? 'End Line + Photo' : 'Photo'}
      </description>
      <ExtendedData>
        <!-- Waypoint Positioning -->
        <Data name="waypointIndex">
          <value>${waypointIndex + 1}</value>
        </Data>
        <Data name="altitude">
          <value>${missionData.calculatedAltitude.toFixed(1)}</value>
        </Data>
        <Data name="altitudeMode">
          <value>AGL</value>
        </Data>
        <Data name="altitudeAGL">
          <value>${missionData.calculatedAltitude.toFixed(1)}</value>
        </Data>
        <Data name="altitudeReference">
          <value>ground</value>
        </Data>
        
        <!-- DroneDeploy Waypoint Settings -->
        <Data name="dd:altitude">
          <value>${missionData.calculatedAltitude.toFixed(1)}</value>
        </Data>
        <Data name="dd:altitudeType">
          <value>agl</value>
        </Data>
        
        <!-- Flight Parameters -->
        <Data name="speed">
          <value>${missionData.parameters.droneSpeed}</value>
        </Data>
        <Data name="heading">
          <value>${flightLine.heading}</value>
        </Data>
        <Data name="turnMode">
          <value>clockwise</value>
        </Data>
        
        <!-- Camera Actions -->
        <Data name="actionType">
          <value>takePhoto</value>
        </Data>
        <Data name="gimbalPitch">
          <value>-90</value>
        </Data>
        <Data name="cameraAction">
          <value>shoot_photo</value>
        </Data>
        <Data name="photoInterval">
          <value>${missionData.droneSpecs.minPhotoInterval}</value>
        </Data>
        
        <!-- DJI-Specific Waypoint Data -->
        <Data name="dji:waypointType">
          <value>photogrammetry</value>
        </Data>
        <Data name="dji:speed">
          <value>${missionData.parameters.droneSpeed}</value>
        </Data>
        <Data name="dji:dampingDistance">
          <value>0.5</value>
        </Data>
        <Data name="dji:cornerRadius">
          <value>0.2</value>
        </Data>
        <Data name="dji:gimbalPitch">
          <value>-90</value>
        </Data>
        <Data name="dji:cameraAction">
          <value>1</value>
        </Data>
        <Data name="dji:flightPathMode">
          <value>goToPointInAStraightLineAndStop</value>
        </Data>
        
        <!-- Drone Model Specific Settings -->
        ${droneModel === "DJI Phantom 4 Pro" ? `
        <Data name="dji:aircraftYaw">
          <value>${flightLine.heading}</value>
        </Data>
        <Data name="dji:flightSpeed">
          <value>${Math.min(missionData.parameters.droneSpeed, 15)}</value>
        </Data>` : `
        <Data name="dji:aircraftYaw">
          <value>${flightLine.heading}</value>
        </Data>
        <Data name="dji:flightSpeed">
          <value>${Math.min(missionData.parameters.droneSpeed, 17)}</value>
        </Data>`}
        
        <!-- Waypoint Locking -->
        <Data name="waypointLocked">
          <value>true</value>
        </Data>
        <Data name="readOnly">
          <value>true</value>
        </Data>
        <Data name="modificationAllowed">
          <value>false</value>
        </Data>
      </ExtendedData>
      <Point>
        <altitudeMode>relativeToGround</altitudeMode>
        <gx:altitudeMode>relativeToSeaFloor</gx:altitudeMode>
        <coordinates>${coord.lng},${coord.lat},${missionData.calculatedAltitude}</coordinates>
      </Point>
    </Placemark>`
  }).join('')
  
  return `
  <!-- Flight Line ${lineIndex + 1} -->
  <Folder>
    <name>${droneModel} - Mission ${missionIndex + 1} - Line ${lineIndex + 1}</name>
    <description>
      Drone Model: ${droneModel}
      Camera: ${droneMetadata.cameraModel}
      Heading: ${flightLine.heading.toFixed(0)}°
      Length: ${flightLine.length.toFixed(1)}m
      Waypoints: ${flightLine.coordinates.length}
      Estimated Photos: ${estimatedPhotos}
      Photo Interval: ${photoInterval.toFixed(1)}m
      
      Flight Line Settings:
      - Speed: ${missionData.parameters.droneSpeed} m/s
      - Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
      - Gimbal Pitch: -90° (nadir)
      - Camera Mode: Single Photo
      - Focus Mode: Auto
    </description>
    
    <!-- Flight Path Visualization -->
    <Placemark>
      <name>Flight Path ${lineIndex + 1}</name>
      <Style>
        <LineStyle>
          <color>${kmlColor}</color>
          <width>4</width>
        </LineStyle>
      </Style>
      <LineString>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>
          ${flightLine.coordinates.map((coord: any) => `${coord.lng},${coord.lat},${missionData.calculatedAltitude}`).join('\n          ')}
        </coordinates>
      </LineString>
    </Placemark>
    
    <!-- Individual Waypoints -->
    ${waypoints}
  </Folder>`
}

// Get comprehensive drone metadata for apps
function getDroneMetadata(droneModel: string, droneSpecs: any): any {
  const baseMetadata = {
    manufacturer: "DJI",
    frequency: "2.4GHz/5.8GHz",
    coordinateSystem: "WGS84"
  }

  if (droneModel === "DJI Phantom 4 Pro") {
    return {
      ...baseMetadata,
      cameraModel: "FC6310",
      djiModelCode: "wm331",
      djiCameraCode: "fc6310",
      djiGimbalCode: "gimbal_fc6310",
      maxSpeed: "20", // m/s
      maxWind: "10", // m/s
      gpsType: "GPS/GLONASS",
      transmissionRange: "7000", // meters
      operatingTemp: "-10° to 40°C",
      takeoffWeight: "1388", // grams
      maxFlightTime: "30", // minutes
      chargingTime: "60", // minutes
      gimbalRange: {
        pitch: "-90° to +30°",
        yaw: "±320°",
        roll: "±15°"
      },
      cameraSettings: {
        iso: "100-3200",
        shutterSpeed: "8-1/8000s",
        imageFormat: "JPEG/DNG",
        videoFormat: "MP4/MOV",
        maxVideoRes: "4K@60fps"
      }
    }
  } else if (droneModel === "DJI Matrice 4E") {
    return {
      ...baseMetadata,
      cameraModel: "L1D-20c",
      djiModelCode: "matrice_4e",
      djiCameraCode: "l1d_20c",
      djiGimbalCode: "gimbal_l1d_20c",
      maxSpeed: "17", // m/s
      maxWind: "12", // m/s
      gpsType: "GPS/GLONASS/BeiDou",
      transmissionRange: "15000", // meters
      operatingTemp: "-20° to 50°C",
      takeoffWeight: "2355", // grams
      maxFlightTime: "35", // minutes
      chargingTime: "90", // minutes
      gimbalRange: {
        pitch: "-90° to +30°",
        yaw: "±320°",
        roll: "±15°"
      },
      cameraSettings: {
        iso: "100-6400",
        shutterSpeed: "8-1/8000s",
        imageFormat: "JPEG/DNG",
        videoFormat: "MP4/MOV",
        maxVideoRes: "4K@120fps"
      }
    }
  } else {
    // Fallback to Phantom 4 Pro
    return getDroneMetadata("DJI Phantom 4 Pro", droneSpecs)
  }
}

// Generate mission documentation for KMZ
function generateMissionDocumentation(flightPlan: FlightPlan, missionData: MissionData): string {
  const droneModel = getDroneModelFromSpecs(missionData.droneSpecs)
  const currentDate = new Date().toLocaleString()
  
  return `
🚁 DRONE MISSION BRIEFING
========================

📅 Mission Date: ${currentDate}
🛩️  Aircraft: ${droneModel}
🎯 Mission Type: Aerial Survey/Photogrammetry

FLIGHT PARAMETERS:
------------------
✈️  Ground Sample Distance: ${missionData.parameters.gsd} cm/px
📏 Flight Altitude: ${missionData.calculatedAltitude.toFixed(1)}m AGL
📸 Front Overlap: ${missionData.parameters.frontOverlap}%
📸 Side Overlap: ${missionData.parameters.sideOverlap}%
🚀 Cruise Speed: ${missionData.parameters.droneSpeed} m/s
🔄 Optimal Heading: ${flightPlan.optimalHeading}°

MISSION STATISTICS:
-------------------
📊 Total Missions: ${flightPlan.missions.length}
⏱️  Total Flight Time: ${flightPlan.totalTime.toFixed(1)} minutes
📷 Total Photos: ${flightPlan.totalPhotos}
🗺️  Survey Area: ${(flightPlan.totalArea / 4046.86).toFixed(2)} acres
🔋 Battery Sessions: ${flightPlan.batteryCount}

AIRCRAFT SPECIFICATIONS:
------------------------
📱 Model: ${droneModel}
📷 Camera: ${getDroneMetadata(droneModel, missionData.droneSpecs).cameraModel}
🔍 Sensor: ${missionData.droneSpecs.sensor.width}×${missionData.droneSpecs.sensor.height}mm
🎯 Focal Length: ${missionData.droneSpecs.focalLength}mm
📐 Image Resolution: ${missionData.droneSpecs.imageDimensions.width}×${missionData.droneSpecs.imageDimensions.height}px
⚡ Photo Interval: ${missionData.droneSpecs.minPhotoInterval}s minimum
🔋 Battery Life: ${missionData.droneSpecs.usableBatteryTime} minutes

SAFETY CHECKLIST:
-----------------
☑️  Weather conditions acceptable
☑️  Airspace clearance obtained
☑️  Battery charged and tested
☑️  Memory card formatted and inserted
☑️  Propellers inspected
☑️  Gimbal calibrated
☑️  Home point set correctly
☑️  Return-to-home altitude configured

MISSION EXECUTION NOTES:
------------------------
• This is a locked flight plan - DO NOT modify waypoints
• Altitude is optimized for ${missionData.parameters.gsd}cm GSD
• Photo overlap ensures complete coverage
• Monitor battery levels between missions
• Verify image capture during flight
• Land and swap batteries between missions

Generated by Droner Mission Planner
Contact mission planner for modifications
`.trim()
}

// Generate read-only protection documentation
function generateProtectionDocumentation(flightPlan: FlightPlan, missionData: MissionData): string {
  const droneModel = getDroneModelFromSpecs(missionData.droneSpecs)
  const currentDate = new Date().toLocaleString()
  
  return `
🔒 FLIGHT PLAN PROTECTION NOTICE
===============================

⚠️  WARNING: READ-ONLY MISSION ⚠️

This flight plan is LOCKED and protected from modifications.

PROTECTION DETAILS:
-------------------
🔐 Locked By: Droner Mission Planner
📅 Lock Date: ${currentDate}
🛩️  Aircraft: ${droneModel}
🎯 Mission Type: Survey/Photogrammetry

WHY THIS MISSION IS LOCKED:
---------------------------
✅ Altitude calculated for precise ${missionData.parameters.gsd}cm GSD
✅ Waypoints optimized for ${missionData.parameters.frontOverlap}%/${missionData.parameters.sideOverlap}% overlap
✅ Flight lines designed for complete coverage
✅ Speed optimized for image quality
✅ Battery missions calculated for safe operation

CONSEQUENCES OF MODIFICATIONS:
------------------------------
❌ Changing altitude → Incorrect Ground Sample Distance
❌ Modifying speed → Poor image overlap/quality
❌ Moving waypoints → Coverage gaps or excessive overlap
❌ Altering overlap → Reconstruction failures
❌ Route changes → Inefficient battery usage

AUTHORIZED MODIFICATIONS:
-------------------------
If modifications are absolutely necessary:
1. Contact the mission planner
2. Provide justification for changes
3. Recalculate coverage and timing
4. Update this documentation
5. Re-lock the modified mission

PILOT RESPONSIBILITIES:
-----------------------
✅ Execute mission exactly as planned
✅ Monitor for safety issues only
✅ Do NOT modify waypoints or parameters
✅ Report any execution problems
✅ Maintain visual line of sight
✅ Follow all regulatory requirements

EMERGENCY PROCEDURES:
---------------------
• Lost signal: RTH activated automatically
• Low battery: Land immediately, swap battery
• Weather change: Abort mission safely
• Obstacle: Use manual override for safety only

For questions or modifications, contact:
Mission Planner: Droner Mission Planner
Generated: ${currentDate}

🚫 UNAUTHORIZED MODIFICATIONS VOID MISSION INTEGRITY 🚫
`.trim()
} 
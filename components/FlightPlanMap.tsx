'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { Map, NavigationControl, FullscreenControl } from 'mapbox-gl'
import { MissionData, FlightPlan, Coordinate } from '@/types/mission'
import 'mapbox-gl/dist/mapbox-gl.css'

interface FlightPlanMapProps {
  missionData: MissionData | null
  flightPlan: FlightPlan | null
}

export default function FlightPlanMap({ missionData, flightPlan }: FlightPlanMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current) return

    // Initialize map
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''
    
    if (!mapboxgl.accessToken) {
      console.warn('Mapbox access token not found. Please set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN')
      return
    }

    map.current = new Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [-74.006, 40.7128], // Default to NYC, will be updated when AOI is loaded
      zoom: 10
    })

    map.current.addControl(new NavigationControl(), 'top-right')
    map.current.addControl(new FullscreenControl(), 'top-right')

    map.current.on('load', () => {
      setMapLoaded(true)
    })

    return () => {
      if (map.current) {
        map.current.remove()
      }
    }
  }, [])

  useEffect(() => {
    if (!map.current || !mapLoaded || !missionData) return

    // Clear existing layers and sources
    clearMap()

    // Add AOI polygon
    addAOIPolygon(missionData.polygon)

    // Fit map to AOI bounds
    fitMapToBounds(missionData.polygon.bounds)

  }, [missionData, mapLoaded])

  useEffect(() => {
    if (!map.current || !mapLoaded || !flightPlan) return

    // Add flight lines
    addFlightLines(flightPlan)

    // Add mission polygons outlines
    addMissionPolygons(flightPlan)

    // Add mission start/end points
    addMissionPoints(flightPlan)

    // Add mission path with direction
    addMissionPath(flightPlan)

  }, [flightPlan, mapLoaded])

  const clearMap = () => {
    if (!map.current) return

    // Remove existing layers
    const layersToRemove = [
      'aoi-polygon',
      'aoi-outline',
      'flight-lines',
      'flight-line-labels',
      'mission-polygons',
      'mission-borders',
      'mission-points',
      'mission-point-labels',
      'mission-path',
      'mission-path-arrows'
    ]

    layersToRemove.forEach(layerId => {
      if (map.current!.getLayer(layerId)) {
        map.current!.removeLayer(layerId)
      }
    })

    // Remove existing sources
    const sourcesToRemove = [
      'aoi-polygon',
      'flight-lines',
      'mission-polygons',
      'mission-points',
      'mission-path'
    ]

    sourcesToRemove.forEach(sourceId => {
      if (map.current!.getSource(sourceId)) {
        map.current!.removeSource(sourceId)
      }
    })
  }

  const addAOIPolygon = (polygon: MissionData['polygon']) => {
    if (!map.current) return

    // Add polygon source
    map.current.addSource('aoi-polygon', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [polygon.coordinates[0].map(coord => [coord.lng, coord.lat])]
        },
        properties: {}
      }
    })

    // Add polygon fill layer
    map.current.addLayer({
      id: 'aoi-polygon',
      type: 'fill',
      source: 'aoi-polygon',
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.2
      }
    })

    // Add polygon outline layer
    map.current.addLayer({
      id: 'aoi-outline',
      type: 'line',
      source: 'aoi-polygon',
      paint: {
        'line-color': '#1d4ed8',
        'line-width': 2
      }
    })
  }

  const addFlightLines = (flightPlan: FlightPlan) => {
    if (!map.current) return

    // Prepare flight line features
    const features = flightPlan.missions.flatMap((mission, missionIndex) => {
      return mission.flightLines.map((flightLine, lineIndex) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: flightLine.coordinates.map(coord => [coord.lng, coord.lat])
        },
        properties: {
          missionIndex,
          lineIndex,
          color: mission.color,
          heading: flightLine.heading
        }
      }))
    })

    // Add flight lines source
    map.current.addSource('flight-lines', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features
      }
    })

    // Add flight lines layer
    map.current.addLayer({
      id: 'flight-lines',
      type: 'line',
      source: 'flight-lines',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.8
      }
    })

    // Add flight line labels
    map.current.addLayer({
      id: 'flight-line-labels',
      type: 'symbol',
      source: 'flight-lines',
      layout: {
        'text-field': ['concat', 'M', ['get', 'missionIndex'], '-', ['get', 'lineIndex']],
        'text-font': ['Open Sans Regular'],
        'text-size': 12,
        'text-offset': [0, 0],
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1
      }
    })
  }

  const addMissionPolygons = (flightPlan: FlightPlan) => {
    if (!map.current) return

    const features = flightPlan.missions
      .filter(m => m.areaPolygon && m.areaPolygon.length > 3)
      .map((m, idx) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [m.areaPolygon!.map(c => [c.lng, c.lat])]
        },
        properties: {
          color: m.color,
          missionIndex: m.index
        }
      }))

    map.current.addSource('mission-polygons', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    })

    // Transparent fill so label halos render nicely if needed
    map.current.addLayer({
      id: 'mission-polygons',
      type: 'fill',
      source: 'mission-polygons',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.06
      }
    })

    // Distinct borders per mission
    map.current.addLayer({
      id: 'mission-borders',
      type: 'line',
      source: 'mission-polygons',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.9
      }
    })
  }

  const addMissionPoints = (flightPlan: FlightPlan) => {
    if (!map.current) return

    const features = flightPlan.missions.flatMap(m => {
      const f: any[] = []
      if (m.startPoint) {
        f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.startPoint.lng, m.startPoint.lat] }, properties: { label: 'S', color: m.color } })
      }
      if (m.endPoint) {
        f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.endPoint.lng, m.endPoint.lat] }, properties: { label: 'E', color: m.color } })
      }
      return f
    })

    map.current.addSource('mission-points', { type: 'geojson', data: { type: 'FeatureCollection', features } })

    map.current.addLayer({
      id: 'mission-points',
      type: 'circle',
      source: 'mission-points',
      paint: {
        'circle-radius': 4,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#000',
        'circle-stroke-width': 1
      }
    })

    map.current.addLayer({
      id: 'mission-point-labels',
      type: 'symbol',
      source: 'mission-points',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-offset': [0, -1.2]
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1
      }
    })
  }

  const addMissionPath = (flightPlan: FlightPlan) => {
    if (!map.current) return

    const features = flightPlan.missions.flatMap(m => (m.pathSegments || []).map(seg => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: seg.coordinates.map(c => [c.lng, c.lat]) },
      properties: { kind: seg.kind, color: seg.color }
    })))

    map.current.addSource('mission-path', { type: 'geojson', data: { type: 'FeatureCollection', features } })

    // Main path lines
    map.current.addLayer({
      id: 'mission-path',
      type: 'line',
      source: 'mission-path',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['==', ['get', 'kind'], 'connector'], 2, 3],
        'line-dasharray': ['case', ['==', ['get', 'kind'], 'connector'], ['literal', [2, 2]], ['literal', [1, 0]]],
        'line-opacity': 0.9
      }
    })

    // Direction arrows along the path
    map.current.addLayer({
      id: 'mission-path-arrows',
      type: 'symbol',
      source: 'mission-path',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 50,
        'icon-image': 'triangle-11',
        'icon-allow-overlap': false,
        'icon-rotate': 90
      },
      paint: {
        'icon-color': ['get', 'color']
      }
    })
  }

  const fitMapToBounds = (bounds: MissionData['polygon']['bounds']) => {
    if (!map.current) return

    map.current.fitBounds([
      [bounds.west, bounds.south],
      [bounds.east, bounds.north]
    ], {
      padding: 50,
      duration: 1000
    })
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4">Flight Plan Map</h2>
      
      {!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
          <p className="text-yellow-800 text-sm">
            Mapbox access token not configured. Please set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN environment variable.
          </p>
        </div>
      )}

      <div className="relative">
        <div
          ref={mapContainer}
          className="w-full h-96 rounded-lg overflow-hidden"
        />
        
        {!missionData && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <p className="text-gray-500">Upload a KML file to view the Area of Interest</p>
          </div>
        )}
      </div>

      {flightPlan && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-700 mb-2">Flight Plan Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Missions:</span>
              <span className="ml-2 font-medium">{flightPlan.missions.length}</span>
            </div>
            <div>
              <span className="text-gray-600">Total Time:</span>
              <span className="ml-2 font-medium">{flightPlan.totalTime.toFixed(1)} min</span>
            </div>
            <div>
              <span className="text-gray-600">Total Photos:</span>
              <span className="ml-2 font-medium">{flightPlan.totalPhotos}</span>
            </div>
            <div>
              <span className="text-gray-600">Optimal Heading:</span>
              <span className="ml-2 font-medium">{flightPlan.optimalHeading.toFixed(0)}°</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 
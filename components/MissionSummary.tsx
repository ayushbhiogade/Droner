'use client'

import { Download, FileText, Map, Archive } from 'lucide-react'
import { MissionData, FlightPlan } from '@/types/mission'
import { generateCSVExport, generateDJIWPMLRaw, generateDJITemplateKML, generateDJIWPMLKMZ } from '@/utils/exportUtils'

interface MissionSummaryProps {
  flightPlan: FlightPlan
  missionData: MissionData
}

export default function MissionSummary({ flightPlan, missionData }: MissionSummaryProps) {
  const handleDownloadStandardKML = () => {
    const kmlContent = generateDJITemplateKML(flightPlan, missionData)
    downloadFile(kmlContent, 'flight-plan.kml', 'application/vnd.google-earth.kml+xml')
  }

  // DroneDeploy KML export removed

  const handleDownloadCSV = () => {
    const csvContent = generateCSVExport(flightPlan, missionData)
    downloadFile(csvContent, 'waypoints.csv', 'text/csv')
  }

  // KMZ (Locked) export removed

  // DJI Waylines KMZ export removed (use WPML Raw if needed)

  const handleDownloadDJIWPMLRaw = () => {
    const wpml = generateDJIWPMLRaw(flightPlan, missionData)
    const currentDate = new Date().toISOString().split('T')[0]
    downloadFile(wpml, `missions-${currentDate}.wpml`, 'application/xml')
  }

  const getDroneModelFromSpecs = (droneSpecs: any): string => {
    if (droneSpecs.sensor.width === 13.2 && droneSpecs.focalLength === 8.8) {
      return "DJI-Phantom-4-Pro"
    } else if (droneSpecs.sensor.width === 17.3 && droneSpecs.focalLength === 24) {
      return "DJI-Matrice-4E"
    } else {
      return "DJI-Phantom-4-Pro"
    }
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    downloadBlob(blob, filename)
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownloadWaylinesKMZ = async () => {
    try {
      const kmz = await generateDJIWPMLKMZ(flightPlan, missionData)
      const currentDate = new Date().toISOString().split('T')[0]
      downloadBlob(kmz, `DJI-Waylines-${currentDate}.kmz`)
    } catch (e) {
      console.error(e)
      alert('Failed to build KMZ')
    }
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4">Mission Summary</h2>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{flightPlan.totalTime.toFixed(1)}</div>
          <div className="text-sm text-blue-600">Total Time (min)</div>
        </div>
        
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{flightPlan.batteryCount}</div>
          <div className="text-sm text-green-600">Batteries</div>
        </div>
        
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{flightPlan.totalPhotos}</div>
          <div className="text-sm text-purple-600">Total Photos</div>
        </div>
        
        <div className="text-center p-4 bg-orange-50 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">{(flightPlan.totalArea / 4046.86).toFixed(1)}</div>
          <div className="text-sm text-orange-600">Area (acres)</div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-700 mb-3">Mission Breakdown</h3>
        <div className="space-y-3">
          {flightPlan.missions.map((mission, index) => (
            <div key={mission.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: mission.color }}
                />
                <span className="font-medium">Mission {index + 1}</span>
              </div>
              <div className="text-sm text-gray-600">
                {mission.estimatedTime.toFixed(1)} min • {mission.estimatedPhotos} photos
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-700 mb-3">Flight Parameters</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Optimal Heading:</span>
            <span className="ml-2 font-medium">{flightPlan.optimalHeading.toFixed(0)}°</span>
          </div>
          <div>
            <span className="text-gray-600">Flight Altitude:</span>
            <span className="ml-2 font-medium">{missionData.calculatedAltitude.toFixed(1)}m AGL</span>
          </div>
          <div>
            <span className="text-gray-600">GSD:</span>
            <span className="ml-2 font-medium">{missionData.parameters.gsd} cm/px</span>
          </div>
          <div>
            <span className="text-gray-600">Drone Speed:</span>
            <span className="ml-2 font-medium">{missionData.parameters.droneSpeed} m/s</span>
          </div>
          <div>
            <span className="text-gray-600">Front Overlap:</span>
            <span className="ml-2 font-medium">{missionData.parameters.frontOverlap}%</span>
          </div>
          <div>
            <span className="text-gray-600">Side Overlap:</span>
            <span className="ml-2 font-medium">{missionData.parameters.sideOverlap}%</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-700 mb-3">Export Flight Plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={handleDownloadWaylinesKMZ}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Archive className="w-4 h-4" />
            <span>DJI Waylines KMZ</span>
          </button>
          <button
            onClick={handleDownloadStandardKML}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <Map className="w-4 h-4" />
            <span>Standard KML</span>
          </button>

          <button
            onClick={handleDownloadDJIWPMLRaw}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <FileText className="w-4 h-4" />
            <span>DJI WPML (Raw)</span>
          </button>
          
          <button
            onClick={handleDownloadCSV}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <FileText className="w-4 h-4" />
            <span>CSV Data</span>
          </button>
        </div>
        
        <div className="mt-3 text-xs text-gray-500">
          <p>• Standard KML: DJI-style template with mission parameters embedded</p>
          <p>• CSV: Waypoint coordinates for third-party mission execution tools</p>
        </div>
        {/* Removed DroneDeploy/KMZ helper box */}
      </div>
    </div>
  )
} 
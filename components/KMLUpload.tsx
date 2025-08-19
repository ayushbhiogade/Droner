'use client'

import { useState, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle } from 'lucide-react'
import { MissionData, KMLData, Polygon, DroneSpecs } from '@/types/mission'
import { parseKML } from '@/utils/kmlParser'
import { calculatePolygonArea, calculateBounds } from '@/utils/geometry'

interface KMLUploadProps {
  onKMLUploaded: (data: MissionData) => void
  missionData: MissionData | null
}

export default function KMLUpload({ onKMLUploaded, missionData }: KMLUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default DJI Phantom 4 Pro specs
  const defaultDroneSpecs: DroneSpecs = {
    sensor: {
      width: 13.2,
      height: 8.8
    },
    focalLength: 8.8,
    imageDimensions: {
      width: 5472,
      height: 3648
    },
    minPhotoInterval: 2,
    usableBatteryTime: 18
  }

  // Default mission parameters
  const defaultParameters = {
    gsd: 2.0,
    frontOverlap: 75,
    sideOverlap: 65,
    droneSpeed: 5.0,
    maxBatteryTime: 18,
    manualHeading: false,
    customHeading: 0
  }

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.kml') && !file.name.toLowerCase().endsWith('.kmz')) {
      setError('Please upload a .kml or .kmz file')
      return
    }

    setUploadedFile(file)
    setError(null)
    setIsProcessing(true)

    try {
      const kmlData = await parseKML(file)
      
      if (!kmlData.coordinates || kmlData.coordinates.length === 0) {
        throw new Error('No valid polygon coordinates found in KML file')
      }

      // Convert coordinates to polygon format
      const polygon: Polygon = {
        coordinates: [kmlData.coordinates],
        area: calculatePolygonArea(kmlData.coordinates),
        bounds: calculateBounds(kmlData.coordinates)
      }

      // Calculate flight altitude based on GSD using correct formula
      const gsdMeters = defaultParameters.gsd / 100 // Convert cm to meters
      const calculatedAltitude = (gsdMeters * defaultDroneSpecs.focalLength * defaultDroneSpecs.imageDimensions.width) / defaultDroneSpecs.sensor.width

      const missionData: MissionData = {
        polygon,
        parameters: defaultParameters,
        droneSpecs: defaultDroneSpecs,
        calculatedAltitude
      }

      onKMLUploaded(missionData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process KML file')
      setUploadedFile(null)
    } finally {
      setIsProcessing(false)
    }
  }, [onKMLUploaded])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null)
    setError(null)
  }, [])

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
        <FileText className="w-5 h-5 text-primary-600" />
        <span>Area of Interest</span>
      </h2>

      {!uploadedFile ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Upload KML/KMZ File
          </p>
          <p className="text-gray-500 mb-4">
            Drag and drop your KML file here, or click to browse
          </p>
          <input
            type="file"
            accept=".kml,.kmz"
            onChange={handleFileInput}
            className="hidden"
            id="kml-upload"
          />
          <label
            htmlFor="kml-upload"
            className="btn-primary cursor-pointer inline-block"
          >
            Choose File
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">
                  {uploadedFile.name}
                </p>
                <p className="text-sm text-green-600">
                  File uploaded successfully
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              className="text-green-600 hover:text-green-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {missionData && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Area:</span>
                <span className="font-medium">
                  {(missionData.polygon.area / 4046.86).toFixed(2)} acres
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Flight Altitude:</span>
                <span className="font-medium">
                  {missionData.calculatedAltitude.toFixed(1)}m AGL
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {isProcessing && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800 text-sm">Processing KML file...</p>
        </div>
      )}
    </div>
  )
} 
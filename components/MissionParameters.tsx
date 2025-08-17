'use client'

import { useState, useEffect } from 'react'
import { Settings, Play, Loader } from 'lucide-react'
import { MissionData, MissionParameters as MissionParams } from '@/types/mission'

interface MissionParametersProps {
  missionData: MissionData
  onParametersChange: (data: MissionData) => void
  onGenerateFlightPlan: (data: MissionData) => void
  isGenerating: boolean
}

export default function MissionParameters({
  missionData,
  onParametersChange,
  onGenerateFlightPlan,
  isGenerating
}: MissionParametersProps) {
  const [parameters, setParameters] = useState<MissionParams>(missionData.parameters)
  const [calculatedAltitude, setCalculatedAltitude] = useState(missionData.calculatedAltitude)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    // Recalculate altitude when GSD changes
    const newAltitude = (parameters.gsd / 100) *
      missionData.droneSpecs.imageDimensions.width *
      (missionData.droneSpecs.focalLength / missionData.droneSpecs.sensor.width)
    setCalculatedAltitude(newAltitude)
    
    // Calculate and validate parameters for warnings (use image pixel dimensions)
    const gsdMeters = parameters.gsd / 100
    const lineSpacing = gsdMeters * missionData.droneSpecs.imageDimensions.width * (1 - parameters.sideOverlap / 100)
    const photoInterval = gsdMeters * missionData.droneSpecs.imageDimensions.height * (1 - parameters.frontOverlap / 100)
    
    const newWarnings: string[] = []
    
    if (lineSpacing < 0.5) {
      newWarnings.push(`Very small line spacing (${lineSpacing.toFixed(2)}m) - consider increasing GSD or reducing overlap`)
    }
    
    if (photoInterval < 0.5) {
      newWarnings.push(`Very small photo interval (${photoInterval.toFixed(2)}m) - consider increasing GSD or reducing overlap`)
    }
    
    if (parameters.gsd < 1) {
      newWarnings.push('GSD below 1cm may result in impractical flight plans')
    }
    
    setWarnings(newWarnings)
  }, [parameters, missionData.droneSpecs])

  const handleParameterChange = (key: keyof MissionParams, value: number) => {
    const newParameters = { ...parameters, [key]: value }
    setParameters(newParameters)
    
    // Update mission data with new parameters
    const updatedMissionData: MissionData = {
      ...missionData,
      parameters: newParameters,
      calculatedAltitude
    }
    
    onParametersChange(updatedMissionData)
  }

  const handleGenerateFlightPlan = () => {
    const updatedMissionData: MissionData = {
      ...missionData,
      parameters,
      calculatedAltitude
    }
    onGenerateFlightPlan(updatedMissionData)
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
        <Settings className="w-5 h-5 text-primary-600" />
        <span>Mission Parameters</span>
      </h2>

      {/* Warnings Section */}
      {warnings.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-yellow-800 font-medium">Parameter Warnings</span>
          </div>
          <ul className="mt-2 text-sm text-yellow-700">
            {warnings.map((warning, index) => (
              <li key={index} className="ml-4">• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {/* GSD Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ground Sample Distance (GSD)
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="0.5"
              max="50"
              step="0.1"
              value={parameters.gsd}
              onChange={(e) => handleParameterChange('gsd', parseFloat(e.target.value))}
              className="input-field flex-1"
            />
            <span className="text-gray-500 text-sm">cm/px</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Corresponding altitude: {calculatedAltitude.toFixed(1)}m AGL
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Tip: Higher GSD values (2-10cm) create more practical flight plans
          </p>
          {parameters.gsd > 50 && (
            <p className="text-xs text-red-600 mt-1">
              ⚠️ GSD above 50cm may result in poor image quality
            </p>
          )}
          {parameters.gsd < 1 && (
            <p className="text-xs text-yellow-600 mt-1">
              ⚠️ GSD below 1cm may create impractical flight plans
            </p>
          )}
        </div>

        {/* Front Overlap */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Front Overlap
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="50"
              max="90"
              step="5"
              value={parameters.frontOverlap}
              onChange={(e) => handleParameterChange('frontOverlap', parseInt(e.target.value))}
              className="input-field flex-1"
            />
            <span className="text-gray-500 text-sm">%</span>
          </div>
        </div>

        {/* Side Overlap */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Side Overlap
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="30"
              max="80"
              step="5"
              value={parameters.sideOverlap}
              onChange={(e) => handleParameterChange('sideOverlap', parseInt(e.target.value))}
              className="input-field flex-1"
            />
            <span className="text-gray-500 text-sm">%</span>
          </div>
        </div>

        {/* Drone Speed */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Drone Speed
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="1"
              max="15"
              step="0.5"
              value={parameters.droneSpeed}
              onChange={(e) => handleParameterChange('droneSpeed', parseFloat(e.target.value))}
              className="input-field flex-1"
            />
            <span className="text-gray-500 text-sm">m/s</span>
          </div>
        </div>

        {/* Battery Time Limit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Battery Time
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="10"
              max="60"
              step="1"
              value={parameters.maxBatteryTime}
              onChange={(e) => handleParameterChange('maxBatteryTime', parseInt(e.target.value))}
              className="input-field flex-1"
            />
            <span className="text-gray-500 text-sm">minutes</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Usable battery time for mission planning
          </p>
        </div>

        {/* Drone Specs Display */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Drone Specifications</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div>
              <span className="font-medium">Sensor:</span> {missionData.droneSpecs.sensor.width}×{missionData.droneSpecs.sensor.height}mm
            </div>
            <div>
              <span className="font-medium">Focal Length:</span> {missionData.droneSpecs.focalLength}mm
            </div>
            <div>
              <span className="font-medium">Image:</span> {missionData.droneSpecs.imageDimensions.width}×{missionData.droneSpecs.imageDimensions.height}px
            </div>
            <div>
              <span className="font-medium">Min Interval:</span> {missionData.droneSpecs.minPhotoInterval}s
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateFlightPlan}
          disabled={isGenerating}
          className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              <span>Generating Flight Plan...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Generate Flight Plan</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
} 
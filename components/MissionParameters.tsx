'use client'

import { useState, useEffect } from 'react'
import { Settings, Play, Loader } from 'lucide-react'
import { MissionData, MissionParameters as MissionParams, DroneSpecs } from '@/types/mission'

interface MissionParametersProps {
  missionData: MissionData
  onParametersChange: (data: MissionData) => void
  onGenerateFlightPlan: (data: MissionData) => void
  isGenerating: boolean
}

// DroneSpecs type is imported from @/types/mission

const droneSpecs: Record<string, DroneSpecs> = {
  'Phantom 4 Pro': {
    sensor: { width: 13.2, height: 8.8 },
    focalLength: 8.8,
    imageDimensions: { width: 5472, height: 3648 },
    minPhotoInterval: 2,
    usableBatteryTime: 18
  },
  'Matrice 4E': {
    sensor: { width: 17.3, height: 13 },
    // Physical focal length (not 35mm equivalent). Tuned to match altitude targets (GSD 1cm → ~37.2m)
    focalLength: 12.19,
    imageDimensions: { width: 5280, height: 3956 },
    minPhotoInterval: 2,
    usableBatteryTime: 25
  }
};

export default function MissionParameters({
  missionData,
  onParametersChange,
  onGenerateFlightPlan,
  isGenerating
}: MissionParametersProps) {
  const [parameters, setParameters] = useState<MissionParams>(missionData.parameters)
  const [calculatedAltitude, setCalculatedAltitude] = useState(missionData.calculatedAltitude)
  const [warnings, setWarnings] = useState<string[]>([])
  const [selectedDrone, setSelectedDrone] = useState('Phantom 4 Pro')

  // Component loaded successfully

  useEffect(() => {
    const specs = droneSpecs[selectedDrone]
    
    // Correct altitude calculation: Altitude = (GSD * focal_length * image_width) / sensor_width
    // GSD in meters, focal length in mm, sensor width in mm
    const gsdMeters = parameters.gsd / 100 // Convert cm to meters
    const newAltitude = (gsdMeters * specs.focalLength * specs.imageDimensions.width) / specs.sensor.width
    
    console.log('🔄 ALTITUDE RECALCULATION:', {
      drone: selectedDrone,
      gsd: parameters.gsd,
      oldAltitude: calculatedAltitude,
      newAltitude: newAltitude,
      specs: specs
    })
    
    setCalculatedAltitude(newAltitude)

    // Calculate ground coverage per image
    const groundWidthPerImage = gsdMeters * specs.imageDimensions.width  // meters
    const groundHeightPerImage = gsdMeters * specs.imageDimensions.height // meters
    
    // Calculate actual spacing between flight lines and photos
    const lineSpacing = groundWidthPerImage * (1 - parameters.sideOverlap / 100)
    const photoInterval = groundHeightPerImage * (1 - parameters.frontOverlap / 100)

    // Altitude calculation completed successfully

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

    if (newAltitude > 120) {
      newWarnings.push(`High altitude (${newAltitude.toFixed(1)}m) - check local regulations`)
    }

    if (newAltitude < 10) {
      newWarnings.push(`Very low altitude (${newAltitude.toFixed(1)}m) - may be impractical`)
    }

    setWarnings(newWarnings)
    
  }, [parameters, selectedDrone])

  // Update mission data when altitude changes
  useEffect(() => {
    const updatedMissionData: MissionData = {
      ...missionData,
      parameters,
      droneSpecs: droneSpecs[selectedDrone],
      calculatedAltitude
    }
    onParametersChange(updatedMissionData)
  }, [calculatedAltitude])

  const handleParameterChange = (key: keyof MissionParams, value: number | boolean) => {
    const newParameters = { ...parameters, [key]: value }
    setParameters(newParameters)
    
    // Update mission data with new parameters and current drone specs
    const updatedMissionData: MissionData = {
      ...missionData,
      parameters: newParameters,
      droneSpecs: droneSpecs[selectedDrone],
      calculatedAltitude
    }
    onParametersChange(updatedMissionData)
  }

  const handleGenerateFlightPlan = () => {
    const updatedMissionData: MissionData = {
      ...missionData,
      parameters,
      droneSpecs: droneSpecs[selectedDrone],
      calculatedAltitude
    }
    onGenerateFlightPlan(updatedMissionData)
  }

  const handleDroneChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newDrone = event.target.value
    console.log('🚁 DRONE CHANGE:', {
      from: selectedDrone,
      to: newDrone,
      currentAltitude: calculatedAltitude
    })
    
    setSelectedDrone(newDrone)
    // Note: Mission data will be updated by useEffect after altitude recalculation
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
        <Settings className="w-5 h-5 text-primary-600" />
        <span>Mission Parameters</span>
      </h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Drone
        </label>
        <select
          value={selectedDrone}
          onChange={handleDroneChange}
          className="input-field bg-white border-2 border-gray-300 min-h-[40px] cursor-pointer hover:border-primary-500 focus:border-primary-600"
          style={{ minHeight: '40px' }}
        >
          <option value="Phantom 4 Pro">DJI Phantom 4 Pro</option>
          <option value="Matrice 4E">DJI Matrice 4E</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Current selection: <span className="font-medium text-gray-700">{selectedDrone}</span>
        </p>
      </div>

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

        {/* Flight Heading Override */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Flight Heading
            </label>
            <div className="flex items-center space-x-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={parameters.manualHeading || false}
                  onChange={(e) => handleParameterChange('manualHeading', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-2 text-sm text-gray-600">Manual</span>
              </label>
            </div>
          </div>
          
          {!parameters.manualHeading ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Auto mode:</span> System will automatically evaluate 0° and 90° headings and choose the most efficient one.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  max="359"
                  step="1"
                  value={parameters.customHeading || 0}
                  onChange={(e) => {
                    const heading = parseInt(e.target.value)
                    if (heading >= 0 && heading <= 359) {
                      handleParameterChange('customHeading', heading)
                    }
                  }}
                  className="input-field flex-1"
                  placeholder="Enter heading (0-359)"
                />
                <span className="text-gray-500 text-sm">degrees</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleParameterChange('customHeading', 0)}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  0° (N)
                </button>
                <button
                  type="button"
                  onClick={() => handleParameterChange('customHeading', 90)}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  90° (E)
                </button>
                <button
                  type="button"
                  onClick={() => handleParameterChange('customHeading', 180)}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  180° (S)
                </button>
                <button
                  type="button"
                  onClick={() => handleParameterChange('customHeading', 270)}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  270° (W)
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {parameters.customHeading !== undefined && (
                  <>Flight lines will run perpendicular to {parameters.customHeading}° heading</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Drone Specs Display */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Drone Specifications</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div>
              <span className="font-medium">Sensor:</span> {droneSpecs[selectedDrone]?.sensor.width}×{droneSpecs[selectedDrone]?.sensor.height}mm
            </div>
            <div>
              <span className="font-medium">Focal Length:</span> {droneSpecs[selectedDrone]?.focalLength}mm
            </div>
            <div>
              <span className="font-medium">Image:</span> {droneSpecs[selectedDrone]?.imageDimensions.width}×{droneSpecs[selectedDrone]?.imageDimensions.height}px
            </div>
            <div>
              <span className="font-medium">Min Interval:</span> {droneSpecs[selectedDrone]?.minPhotoInterval}s
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
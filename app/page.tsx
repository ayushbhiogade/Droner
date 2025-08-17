'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import KMLUpload from '@/components/KMLUpload'
import MissionParameters from '@/components/MissionParameters'
import FlightPlanMap from '@/components/FlightPlanMap'
import MissionSummary from '@/components/MissionSummary'
import { MissionData, FlightPlan } from '@/types/mission'
import { generateFlightPlan } from '@/utils/flightPlanGenerator'

export default function Home() {
  const [missionData, setMissionData] = useState<MissionData | null>(null)
  const [flightPlan, setFlightPlan] = useState<FlightPlan | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleMissionDataUpdate = (data: MissionData) => {
    setMissionData(data)
    setFlightPlan(null) // Reset flight plan when parameters change
  }

  const handleFlightPlanGenerated = (plan: FlightPlan) => {
    setFlightPlan(plan)
  }

  const handleGenerateFlightPlan = async (data: MissionData) => {
    setIsGenerating(true)
    
    try {
      console.log('Starting flight plan generation with data:', data)
      console.log('Polygon bounds:', data.polygon.bounds)
      console.log('Parameters:', data.parameters)
      
      // Generate the actual flight plan using the engine
      const generatedPlan = generateFlightPlan(data)
      
      console.log('Flight plan generated successfully:', generatedPlan)
      handleFlightPlanGenerated(generatedPlan)
    } catch (error) {
      console.error('Failed to generate flight plan:', error)
      // You could add error handling UI here
      alert('Failed to generate flight plan. Check console for details.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Input & Configuration */}
          <div className="lg:col-span-1 space-y-6">
            <KMLUpload 
              onKMLUploaded={(data) => setMissionData(data)}
              missionData={missionData}
            />
            
            {missionData && (
              <MissionParameters
                missionData={missionData}
                onParametersChange={handleMissionDataUpdate}
                onGenerateFlightPlan={handleGenerateFlightPlan}
                isGenerating={isGenerating}
              />
            )}
          </div>

          {/* Right Column - Map & Results */}
          <div className="lg:col-span-2 space-y-6">
            <FlightPlanMap
              missionData={missionData}
              flightPlan={flightPlan}
            />
            
            {flightPlan && missionData && (
              <MissionSummary
                flightPlan={flightPlan}
                missionData={missionData}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
} 
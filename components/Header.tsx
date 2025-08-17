'use client'

import { Plane, Map } from 'lucide-react'

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-primary-600">
            <Plane className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Droner</h1>
          </div>
          <div className="text-gray-400">|</div>
          <div className="flex items-center space-x-2 text-gray-600">
            <Map className="w-5 h-5" />
            <span className="text-lg font-medium">Mission Planner</span>
          </div>
        </div>
        <p className="mt-2 text-gray-600">
          Automated drone survey flight planning from KML Area of Interest
        </p>
      </div>
    </header>
  )
} 
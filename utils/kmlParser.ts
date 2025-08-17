import { XMLParser } from 'fast-xml-parser'
import { KMLData, Coordinate } from '@/types/mission'

export async function parseKML(file: File): Promise<KMLData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_'
        })
        
        const result = parser.parse(content)
        
        // Extract coordinates from KML structure
        const coordinates = extractCoordinates(result)
        
        if (coordinates.length === 0) {
          reject(new Error('No valid coordinates found in KML file'))
          return
        }
        
        resolve({
          name: extractName(result),
          description: extractDescription(result),
          coordinates
        })
      } catch (error) {
        reject(new Error('Failed to parse KML file'))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsText(file)
  })
}

function extractCoordinates(kmlData: any): Coordinate[] {
  const coordinates: Coordinate[] = []
  
  // Navigate through KML structure to find coordinates
  const placemarks = findPlacemarks(kmlData)
  
  for (const placemark of placemarks) {
    if (placemark.Polygon?.outerBoundaryIs?.LinearRing?.coordinates) {
      const coordString = placemark.Polygon.outerBoundaryIs.LinearRing.coordinates
      const parsedCoords = parseCoordinateString(coordString)
      coordinates.push(...parsedCoords)
    } else if (placemark.LineString?.coordinates) {
      const coordString = placemark.LineString.coordinates
      const parsedCoords = parseCoordinateString(coordString)
      coordinates.push(...parsedCoords)
    }
  }
  
  return coordinates
}

function findPlacemarks(kmlData: any): any[] {
  const placemarks: any[] = []
  
  function searchForPlacemarks(obj: any) {
    if (obj.Placemark) {
      if (Array.isArray(obj.Placemark)) {
        placemarks.push(...obj.Placemark)
      } else {
        placemarks.push(obj.Placemark)
      }
    }
    
    // Recursively search nested objects
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        searchForPlacemarks(obj[key])
      }
    }
  }
  
  searchForPlacemarks(kmlData)
  return placemarks
}

function parseCoordinateString(coordString: string): Coordinate[] {
  const coordinates: Coordinate[] = []
  const lines = coordString.trim().split('\n')
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine) {
      const parts = trimmedLine.split(',').map(part => part.trim())
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0])
        const lat = parseFloat(parts[1])
        
        if (!isNaN(lat) && !isNaN(lng)) {
          coordinates.push({ lat, lng })
        }
      }
    }
  }
  
  return coordinates
}

function extractName(kmlData: any): string | undefined {
  // Try to find name in various locations
  if (kmlData.kml?.Document?.name) {
    return kmlData.kml.Document.name
  }
  
  const placemarks = findPlacemarks(kmlData)
  for (const placemark of placemarks) {
    if (placemark.name) {
      return placemark.name
    }
  }
  
  return undefined
}

function extractDescription(kmlData: any): string | undefined {
  // Try to find description in various locations
  if (kmlData.kml?.Document?.description) {
    return kmlData.kml.Document.description
  }
  
  const placemarks = findPlacemarks(kmlData)
  for (const placemark of placemarks) {
    if (placemark.description) {
      return placemark.description
    }
  }
  
  return undefined
} 
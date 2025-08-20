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
        
        console.log('📁 KML file loaded, parsing structure...')
        
        // Extract coordinates from KML structure
        const coordinates = extractCoordinates(result)
        
        console.log(`📊 KML parsing results: ${coordinates.length} coordinates found`)
        console.log('📍 First few coordinates:', coordinates.slice(0, 3))
        
        if (coordinates.length === 0) {
          reject(new Error('No valid coordinates found in KML file'))
          return
        }
        
        const name = extractName(result)
        const description = extractDescription(result)
        
        console.log(`📋 KML metadata: name="${name}", description="${description}"`)
        
        resolve({
          name,
          description,
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
  
  // Handle both newline-separated and space-separated coordinate formats
  let coordPairs: string[]
  if (coordString.includes('\n')) {
    coordPairs = coordString.trim().split('\n')
  } else {
    // Split by spaces for coordinates on the same line
    coordPairs = coordString.trim().split(/\s+/)
  }
  
  console.log('🔍 Raw coordinate string:', coordString)
  console.log('🔍 Found coordinate pairs:', coordPairs.length)
  
  // Your KML file uses longitude,latitude format (KML standard)
  // First number is longitude, second number is latitude
  const isLatLngFormat = false
  console.log('🔍 Using coordinate format: longitude,latitude (KML standard)')
  
  // Parse all coordinates using the detected format
  for (const pair of coordPairs) {
    const trimmedPair = pair.trim()
    if (trimmedPair) {
      const parts = trimmedPair.split(',').map((part: string) => part.trim())
      if (parts.length >= 2) {
        let lat: number, lng: number
        
        if (isLatLngFormat) {
          // Format: latitude,longitude
          lat = parseFloat(parts[0])
          lng = parseFloat(parts[1])
        } else {
          // Format: longitude,latitude (KML standard)
          lng = parseFloat(parts[0])
          lat = parseFloat(parts[1])
        }
        
        if (!isNaN(lat) && !isNaN(lng)) {
          // Validate coordinate ranges
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            coordinates.push({ lat, lng })
            console.log(`✅ Added coordinate: lat=${lat}, lng=${lng}`)
          } else {
            console.warn(`⚠️ Invalid coordinates: lat=${lat}, lng=${lng}`)
          }
        } else {
          console.warn(`⚠️ Failed to parse coordinates from: ${trimmedPair}`)
        }
      }
    }
  }
  
  console.log(`📍 Parsed ${coordinates.length} coordinates`)
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
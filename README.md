# Droner - Mission Planner MVP

A client-side web application that automates the generation of efficient drone survey flight plans from KML Area of Interest (AOI) files.

## 🎯 Project Goal

The goal of this Minimum Viable Product (MVP) is to validate the geometric calculations and workflow for creating parallel swaths, optimizing flight direction, and splitting missions based on battery constraints. This serves as the foundational first step toward developing a comprehensive drone mission planning tool.

## ✨ Features

### Core Functionality

- **KML Upload**: Upload .kml or .kmz files containing polygon AOI
- **Automatic Flight Planning**: Generate parallel flight lines with optimal heading
- **Battery Partitioning**: Automatically split missions based on battery constraints
- **Interactive Visualization**: View AOI and flight lines on an interactive map
- **Export Options**: Download flight plans as KML and CSV files

### Technical Features

- **Optimal Heading Calculation**: Automatically determines most efficient flight direction
- **Swath Generation**: Creates parallel flight lines with proper spacing
- **Waypoint Densification**: Generates waypoints based on photo requirements
- **Mission Splitting**: Partitions flight plan into battery-constrained missions

## 🚀 Technology Stack

- **Frontend**: Next.js 14 with React 18
- **Styling**: Tailwind CSS with custom design system
- **Mapping**: Mapbox GL JS for interactive map visualization
- **Geospatial**: Turf.js for client-side geometric calculations
- **File Processing**: Fast XML Parser for KML parsing
- **Icons**: Lucide React for modern iconography
- **Animations**: Framer Motion for smooth UI transitions

## 📋 Prerequisites

- Node.js 18+
- npm or yarn package manager
- Mapbox access token (free tier available)

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd droner-mission-planner
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:

   ```env
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
   ```

4. **Get a Mapbox access token**
   - Sign up at [Mapbox](https://www.mapbox.com/)
   - Navigate to your account dashboard
   - Create a new token or use the default public token
   - Copy the token to your `.env.local` file

## 🚀 Running the Application

1. **Development mode**

   ```bash
   npm run dev
   # or
   yarn dev
   ```

2. **Open your browser**
   Navigate to `http://localhost:3000`

3. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## 📱 Usage

### 1. Upload KML File

- Drag and drop a .kml or .kmz file onto the upload area
- Or click "Choose File" to browse and select a file
- The application will automatically parse the polygon and calculate the area

### 2. Configure Mission Parameters

- **Ground Sample Distance (GSD)**: Set desired resolution in cm/px
- **Front Overlap**: Set percentage of overlap between consecutive photos
- **Side Overlap**: Set percentage of overlap between adjacent flight lines
- **Drone Speed**: Set flight speed in m/s
- **Max Battery Time**: Set maximum usable battery time in minutes

### 3. Generate Flight Plan

- Click "Generate Flight Plan" to create the optimized flight plan
- The system will calculate optimal heading, generate flight lines, and partition into missions

### 4. Review and Export

- View the generated flight plan on the interactive map
- Review mission summary and breakdown
- Download flight plan as KML (for visualization) or CSV (for waypoints)

## 🏗️ Project Structure

```
droner-mission-planner/
├── app/                    # Next.js app directory
│   ├── globals.css        # Global styles and Tailwind imports
│   ├── layout.tsx         # Root layout component
│   └── page.tsx           # Main application page
├── components/             # React components
│   ├── Header.tsx         # Application header
│   ├── KMLUpload.tsx      # KML file upload component
│   ├── MissionParameters.tsx # Mission configuration form
│   ├── FlightPlanMap.tsx  # Interactive map component
│   └── MissionSummary.tsx # Flight plan summary and export
├── types/                  # TypeScript type definitions
│   └── mission.ts         # Mission and flight plan types
├── utils/                  # Utility functions
│   ├── kmlParser.ts       # KML file parsing utilities
│   ├── geometry.ts        # Geometric calculations
│   ├── flightPlanGenerator.ts # Flight plan generation engine
│   └── exportUtils.ts     # Export utilities (KML/CSV)
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

## 🔧 Configuration

### Drone Specifications

The application is currently configured for the **DJI Phantom 4 Pro**:

- Sensor: 1" (13.2mm × 8.8mm)
- Focal Length: 8.8mm
- Image Resolution: 5472 × 3648 pixels
- Minimum Photo Interval: 2 seconds
- Default Usable Battery: 18 minutes

### Default Parameters

- GSD: 2.0 cm/px
- Front Overlap: 75%
- Side Overlap: 65%
- Drone Speed: 5.0 m/s
- Max Battery Time: 18 minutes

## 📊 Output Formats

### KML Export

- Flight lines organized by mission
- Color-coded by battery mission
- Compatible with Google Earth and GIS software
- Includes metadata and styling

### CSV Export

- Waypoint coordinates (Lat, Lon, Alt, Heading)
- Organized by mission and flight line
- Compatible with third-party mission execution tools
- Includes mission and line identifiers

## 🚧 Limitations (MVP)

- **Single Drone Model**: Only supports DJI Phantom 4 Pro
- **Flat Earth Model**: Assumes constant altitude across AOI
- **Basic Patterns**: Only parallel swath patterns (no cross-grid)
- **Client-Side Only**: No user accounts or server-side storage
- **KML Input Only**: Only accepts polygon KML files

## 🔮 Future Enhancements

- **Multiple Drone Models**: Support for various drone and camera combinations
- **Terrain Following**: Integration with DEM/SRTM data
- **Advanced Patterns**: Cross-grid, spiral, and custom flight patterns
- **DJI Pilot 2 Format**: Direct export to DJI mission format
- **User Accounts**: Save and share flight plans
- **Advanced Analytics**: Detailed flight time and battery analysis

## 🤝 Contributing

This is an MVP project focused on validating core functionality. Contributions are welcome for:

- Bug fixes and improvements
- Documentation enhancements
- Performance optimizations
- UI/UX improvements

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For questions or issues:

1. Check the project documentation
2. Review existing issues on GitHub
3. Create a new issue with detailed information

## 🙏 Acknowledgments

- Built with Next.js and React
- Powered by Mapbox for mapping
- Uses Turf.js for geospatial calculations
- Styled with Tailwind CSS

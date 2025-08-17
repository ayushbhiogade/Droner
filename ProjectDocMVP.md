1. Project Goal & Vision

The goal of this Minimum Viable Product (MVP) is to build a client-side web application that automates the generation of efficient drone survey flight plans from a user-provided KML Area of Interest (AOI). The core purpose is to validate the geometric calculations and workflow for creating parallel swaths, optimizing flight direction, and splitting missions based on battery constraints. The long-term vision is to develop a comprehensive drone mission planning tool, and this MVP serves as the foundational first step.

2. Core User Story

"As a drone pilot, I want to upload a KML polygon of my survey area and input my desired operational parameters, so that I can instantly visualize and download an efficient, multi-battery flight plan compatible with my drone."

3. Features in Scope (MVP)

The MVP will be a single-page web application with the following features:

3.1. Input & Configuration

KML Upload: Users can upload a .kml or .kmz file containing a single polygon defining the Area of Interest (AOI).

Drone & Camera Preset: The application will use a single, hardcoded preset for the DJI Phantom 4 Pro.

User-Defined Parameters: A simple UI form will allow users to set the following:

Ground Sample Distance (GSD): In cm/px. The corresponding flight altitude (AGL) will be calculated and displayed.

Front & Side Overlap: In percentage (e.g., 75% front, 65% side).

Drone Speed: In m/s.

Mission Splitting: Limit missions by battery duration (in minutes).

3.2. Flight Plan Generation Engine

Optimal Heading Calculation: The application will automatically determine the most efficient flight direction (course angle) by analyzing the polygon's geometry to minimize the number of turns and total flight time.

Swath Generation: Parallel flight lines (swaths) will be generated within the AOI polygon based on the calculated line spacing.

Waypoint Densification: Waypoints will be generated along each flight line, with triggers calculated based on the required photo distance and the camera's minimum interval.

Battery Partitioning: The complete flight plan will be automatically split into separate missions, ensuring no single mission exceeds the specified usable battery time. A fixed time penalty will be added for each turn.

3.3. Visualization & Output

Interactive Map: The uploaded AOI and all generated flight lines will be displayed on an interactive map. Each battery mission will be color-coded for clarity.

Mission Summary: A simple summary panel will display key calculated metrics for the entire plan:

Estimated Total Flying Time

Estimated Number of Batteries Required

Estimated Total Photos

Total Mission Area (in acres)

Downloadable Files: Users can download the generated plan in two formats:

Flight Lines KML: A KML file showing the flight lines, with separate folders for each battery mission , for easy visualization in Google Earth or other GIS software.

Waypoints CSV: A simple CSV file containing the list of waypoints (Lat, Lon, Alt, Heading). This provides a basic, interoperable format for potential use in third-party mission execution tools.

4. Features Out of Scope (Post-MVP)

To ensure rapid delivery, the following features are explicitly excluded from the MVP:

User Accounts & Backend: No user login, registration, or server-side saving of flight plans. The tool will be entirely client-side and ephemeral.

Terrain Following: The MVP will assume a constant flight altitude (AGL) across the entire AOI (i.e., a flat earth model). Support for DEM/SRTM data is a priority for a future version.

Polyline/Corridor Input: The MVP will only accept polygon KMLs.

Advanced Mission Parameters: Features like cross-grid patterns, gimbal pitch control, and specific "end of mission" actions will not be included.

Multiple Drone/Camera Profiles: The DJI Phantom 4 Pro will be the only available option.

Direct DJI Pilot 2 Format: Generation of the proprietary DJI Pilot 2 Wayline format is a key future goal but is not part of the MVP. The CSV output is the interim solution.

5. Technology Stack & Assumptions

Frontend: React (or Next.js for its structure and performance benefits).

UI/UX: Tailwind CSS for styling, Framer Motion for animations, and Lucide Icons for iconography.

Mapping Library: Mapbox for map visualization.

Backend: Node.js (e.g., with Express.js). For the MVP, its role will be minimal, primarily serving the frontend application. It provides a foundation for future server-side capabilities.

Geospatial Libraries:

Turf.js: (Client-side) For all in-browser geospatial calculations.

GDAL: (Server-side) To be integrated in a future version for advanced processing like terrain analysis from DEM files. Not used in the MVP.

Default Drone Specs (DJI Phantom 4 Pro):

Sensor: 1" (13.2mm x 8.8mm)

Focal Length: 8.8mm

Image Dimensions: 5472x3648 px

Min Photo Interval: 2 seconds

Default Usable Battery: 18 minutes

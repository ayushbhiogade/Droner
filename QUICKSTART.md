# Quick Start Guide - Droner Mission Planner

## 🚀 Get Up and Running in 5 Minutes

### 1. Prerequisites

- Node.js 18+ installed
- A Mapbox access token (free)

### 2. Setup

```bash
# Install dependencies
npm install

# Create environment file
copy env.example .env.local
# Edit .env.local and add your Mapbox token
```

### 3. Get Mapbox Token

1. Go to [Mapbox](https://account.mapbox.com/access-tokens/)
2. Sign up/login and create a new token
3. Copy the token to `.env.local`

### 4. Run the Application

```bash
npm run dev
# or
npx next dev
```

### 5. Open Your Browser

Navigate to `http://localhost:3000`

### 6. Test with Sample Data

1. Use the provided `test-area.kml` file
2. Upload it to see the Area of Interest
3. Adjust mission parameters
4. Generate a flight plan

## 🧪 Testing the Application

### Sample KML File

The `test-area.kml` file contains a simple rectangular area in New York City that you can use to test the application.

### Expected Results

- Area: ~1.5 acres
- Flight Altitude: ~35m AGL (with default 2cm GSD)
- Flight Lines: Parallel swaths with optimal heading
- Missions: Automatically split by battery constraints

## 🔧 Troubleshooting

### Common Issues

1. **"Mapbox access token not found"**

   - Check that `.env.local` exists and contains `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
   - Restart the development server after adding the token

2. **Build errors**

   - Run `npm install` to ensure all dependencies are installed
   - Check that Node.js version is 18+

3. **Map not loading**
   - Verify your Mapbox token is valid
   - Check browser console for errors

### Getting Help

- Check the main README.md for detailed documentation
- Review the project structure in the README
- Check browser console for any JavaScript errors

## 📱 Next Steps

Once you have the basic application running:

1. Try uploading your own KML files
2. Experiment with different mission parameters
3. Test the export functionality (KML/CSV)
4. Explore the flight plan generation algorithms

## 🎯 What You Should See

- **Header**: Droner Mission Planner title with plane icon
- **Left Panel**: KML upload and mission parameters
- **Right Panel**: Interactive map and mission summary
- **Map**: Satellite view with your uploaded area
- **Flight Plan**: Color-coded missions with battery partitioning

import { create } from 'zustand';

const useStore = create((set) => ({
  apiKey: '',
  setApiKey: (key) => set({ apiKey: key }),

  userNeeds: '',
  setUserNeeds: (needs) => set({ userNeeds: needs }),

  aiMode: 'manual', // 'manual' or 'api'
  setAiMode: (mode) => set({ aiMode: mode }),

  aiResponse: '',
  setAiResponse: (response) => set({ aiResponse: response }),

  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  // Coordinates and Location
  latitude: 31.0543, // Default: Kibbutz Retamim
  longitude: 34.6974,
  locationName: 'רתמים',
  setCoordinates: (lat, lng, name) => set({ latitude: lat, longitude: lng, locationName: name }),

  // Manual Overrides and Parsed values
  houseRotation: 45, // default rotation in degrees (0 = North)
  setHouseRotation: (rotation) => set({ houseRotation: rotation }),

  windDirection: 'nw', // 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'
  setWindDirection: (dir) => set({ windDirection: dir }),

  windSpeed: 15, // wind strength (knots / relative)
  setWindSpeed: (speed) => set({ windSpeed: speed }),

  buildingHeight: 2.8, // standard 2.8 meters per floor
  setBuildingHeight: (height) => set({ buildingHeight: height }),

  houseCorners: [[0, 0], [12, 0], [12, 9], [0, 9]], // Corners in meters [x, y] relative to home layout
  setHouseCorners: (corners) => set({ houseCorners: corners }),

  // Visualizer State
  season: 'summer', // 'summer', 'winter', 'transition'
  setSeason: (season) => {
    let day = 172; // Summer solstice
    if (season === 'winter') day = 355; // Winter solstice
    if (season === 'transition') day = 80; // Spring equinox
    set({ season, dayOfYear: day });
  },

  timeOfDay: 'noon', // 'morning', 'noon', 'evening'
  setTimeOfDay: (timeOfDay) => {
    let hr = 12;
    if (timeOfDay === 'morning') hr = 8;
    if (timeOfDay === 'evening') hr = 16;
    set({ timeOfDay, hour: hr });
  },

  dayOfYear: 172, // 1 - 365
  setDayOfYear: (day) => set({ dayOfYear: day }),

  hour: 12, // 0 - 24
  setHour: (hr) => {
    let label = 'noon';
    if (hr >= 6 && hr < 11) label = 'morning';
    else if (hr >= 11 && hr < 15) label = 'noon';
    else if (hr >= 15 && hr < 19) label = 'evening';
    set({ hour: hr, timeOfDay: label });
  },

  showSun: true,
  setShowSun: (show) => set({ showSun: show }),

  showWind: true,
  setShowWind: (show) => set({ showWind: show }),

  // House footprint zoom factor
  houseZoom: 1.0,
  setHouseZoom: (zoom) => set({ houseZoom: zoom }),
}));

export default useStore;

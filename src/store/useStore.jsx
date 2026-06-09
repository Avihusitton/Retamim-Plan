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

  // Visualizer State
  season: 'summer', // 'summer', 'winter', 'transition'
  setSeason: (season) => set({ season }),

  timeOfDay: 'noon', // 'morning', 'noon', 'evening'
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),

  showSun: true,
  setShowSun: (show) => set({ showSun: show }),

  showWind: true,
  setShowWind: (show) => set({ showWind: show }),
}));

export default useStore;

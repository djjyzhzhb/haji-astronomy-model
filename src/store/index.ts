import { create } from 'zustand'
import { StoreState, CelestialBody, DetailPageState } from '../types'
import { createSimpleOrbit } from '../utils/keplerOrbit'
import { TextureParams } from '../utils/textureGenerator'

// 默认天体数据
const defaultCelestialBodies: CelestialBody[] = [
  {
    id: 'star-1',
    name: '主恒星',
    type: 'star',
    radius: 5,
    rotationSpeed: 0.01,
    color: '#ffdd44',
    emissiveColor: '#ffaa00',
    description: '一颗年轻的黄矮星，为整个恒星系统提供光和热。',
    mass: '1.0 M☉',
    diameter: '1,392,700 km',
    temperature: '5,778 K',
  },
  {
    id: 'planet-1',
    name: '宜居行星',
    type: 'planet',
    radius: 2,
    distance: 20,
    rotationSpeed: 0.02,
    color: '#4a90d9',
    description: '位于宜居带内的类地行星，拥有海洋、陆地和大气。',
    mass: '1.2 M⊕',
    diameter: '14,000 km',
    temperature: '288 K',
    hasRing: true,
    ringColor: '#d4a574',
    textureType: 'earth-like',
    axialTilt: 0.41, // ~23.5°
    orbitalElements: createSimpleOrbit(20, 0.03, 0), // 倾角0
  },
  {
    id: 'moon-1',
    name: '大卫星',
    type: 'moon',
    radius: 0.8,
    distance: 5,
    rotationSpeed: 0.03,
    color: '#c0c0c0',
    description: '宜居行星的最大卫星，表面布满陨石坑。',
    mass: '0.02 M⊕',
    diameter: '3,474 km',
    temperature: '220 K',
    parentId: 'planet-1',
    textureType: 'moon-like',
    axialTilt: 0.03, // ~1.5°
    orbitalElements: createSimpleOrbit(5, 0.02, 0.02), // 小倾角
  },
  {
    id: 'moon-2',
    name: '小卫星A',
    type: 'moon',
    radius: 0.3,
    distance: 7,
    rotationSpeed: 0.04,
    color: '#a0a0a0',
    description: '一颗小型的不规则卫星。',
    mass: '0.001 M⊕',
    diameter: '1,200 km',
    temperature: '200 K',
    parentId: 'planet-1',
    axialTilt: 0.1,
    orbitalElements: createSimpleOrbit(7, 0.08, 0.05),
  },
  {
    id: 'moon-3',
    name: '小卫星B',
    type: 'moon',
    radius: 0.25,
    distance: 9,
    rotationSpeed: 0.05,
    color: '#909090',
    description: '最外层的小型卫星，轨道较为稳定。',
    mass: '0.0005 M⊕',
    diameter: '900 km',
    temperature: '180 K',
    parentId: 'planet-1',
    axialTilt: 0.15,
    orbitalElements: createSimpleOrbit(9, 0.05, 0.03),
  },
  {
    id: 'planet-2',
    name: '红色行星',
    type: 'planet',
    radius: 1.5,
    distance: 35,
    rotationSpeed: 0.018,
    color: '#cd5c5c',
    description: '一颗干燥的红色星球，拥有极地冰盖。',
    mass: '0.5 M⊕',
    diameter: '10,000 km',
    temperature: '210 K',
    textureType: 'mars-like',
    axialTilt: 0.44, // ~25°
    orbitalElements: createSimpleOrbit(35, 0.09, 0), // 倾角0
  },
  {
    id: 'planet-3',
    name: '气态巨星',
    type: 'planet',
    radius: 4,
    distance: 60,
    rotationSpeed: 0.04,
    color: '#daa520',
    description: '巨大的气态行星，拥有标志性的风暴系统。',
    mass: '300 M⊕',
    diameter: '40,000 km',
    temperature: '120 K',
    hasRing: true,
    ringColor: '#c0c0c0',
    textureType: 'gas-giant',
    axialTilt: 0.05, // ~3°
    orbitalElements: createSimpleOrbit(60, 0.05, 0), // 倾角0
  },
]

const defaultDetailPageState: DetailPageState = {
  rotationSpeed: 0.2,
  planetScale: 1,
  showClouds: true,
  showAtmosphere: true,
  textureParams: {
    resolution: '2048',
    terrainRoughness: 0.5,
    cloudCoverage: 0.4,
    cloudSpeed: 0.2,
    atmosphereDensity: 0.6,
    atmosphereColor: '#64a5ff',
    seed: 42
  },
  qualityLevel: 'high',
  dayTime: 0.5,
  dayNightCycleSpeed: 0.05,
  atmosphereGlowIntensity: 1.0,
  atmosphereInnerRadius: 1.05,  // 比例值，基于基础半径
  atmosphereOuterRadius: 1.25,  // 比例值，基于基础半径
  viewPreset: 'global',
  axialTilt: 0.41,
  // 行星环相关
  showRing: true,
  ringOpacity: 1.0,
  ringEmissiveIntensity: 0.25,
  ringInnerRadiusScale: 1.0,
  ringOuterRadiusScale: 1.0,
  showRingParticles: true,
  ringParticleCount: 500,
  ringParticleSize: 1.0,
  ringParticleOpacity: 0.6,
  ringParticleRadiusScale: 1.0
}

export const useStore = create<StoreState & { celestialBodies: CelestialBody[], detailPageState: DetailPageState }>((set) => ({
  celestialBodies: defaultCelestialBodies,
  timeScale: 1,
  isPaused: false,
  showOrbits: true,
  selectedBody: null,
  focusBody: null,
  brightness: 1.5,
  backgroundBrightness: 0.3,
  backgroundColor: '#0a0a1a',
  showNebula: true,
  distanceScale: 1,
  sizeScale: 1,
  lightIntensity: 1.0,
  ambientLight: 0.3,
  starGlow: 1.0,
  showAtmosphere: true,
  showRings: true,
  showAsteroids: true,
  showDustCloud: true,
  showShadows: true,
  currentPage: 'main',
  selectedPlanetId: null,
  detailPageState: defaultDetailPageState,

  setTimeScale: (scale) => set({ timeScale: scale }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  toggleOrbits: () => set((state) => ({ showOrbits: !state.showOrbits })),
  selectBody: (body) => set({ selectedBody: body }),
  setFocusBody: (body) => set({ focusBody: body }),
  setBrightness: (value) => set({ brightness: value }),
  setBackgroundBrightness: (value) => set({ backgroundBrightness: value }),
  setBackgroundColor: (color) => set({ backgroundColor: color }),
  setShowNebula: (show) => set({ showNebula: show }),
  setDistanceScale: (value) => set({ distanceScale: value }),
  setSizeScale: (value) => set({ sizeScale: value }),
  setLightIntensity: (value) => set({ lightIntensity: value }),
  setAmbientLight: (value) => set({ ambientLight: value }),
  setStarGlow: (value) => set({ starGlow: value }),
  setShowAtmosphere: (show) => set({ showAtmosphere: show }),
  setShowRings: (show) => set({ showRings: show }),
  setShowAsteroids: (show) => set({ showAsteroids: show }),
  setShowDustCloud: (show) => set({ showDustCloud: show }),
  setShowShadows: (show) => set({ showShadows: show }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setSelectedPlanetId: (id) => set({ selectedPlanetId: id }),

  updateDetailPageState: (updates: Partial<DetailPageState>) => set((state) => ({
    detailPageState: { ...state.detailPageState, ...updates }
  })),

  updateTextureParams: (updates: Partial<TextureParams>) => set((state) => ({
    detailPageState: {
      ...state.detailPageState,
      textureParams: { ...state.detailPageState.textureParams, ...updates }
    }
  })),

  updateCelestialBody: (id, updates) => set((state) => ({
    celestialBodies: state.celestialBodies.map(body => 
      body.id === id ? { ...body, ...updates } : body
    ),
    // 如果更新的是选中的天体，也更新selectedBody
    selectedBody: state.selectedBody?.id === id 
      ? { ...state.selectedBody, ...updates } 
      : state.selectedBody,
    // 如果更新的是聚焦的天体，也更新focusBody
    focusBody: state.focusBody?.id === id 
      ? { ...state.focusBody, ...updates } 
      : state.focusBody,
  })),
}))

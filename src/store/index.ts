import { create } from 'zustand'
import { StoreState, CelestialBody, DetailPageState, SurfaceObservationState, TimeSystem, CalendarSystem } from '../types'
import { createSimpleOrbit } from '../utils/keplerOrbit'
import { TextureParams } from '../utils/textureGenerator'
import { setHash } from '../utils/router'

// 时间系统默认参数（来自设定文件）
const defaultTimeSystem: TimeSystem = {
  T: 0,
  timeScale: 1,
  isPaused: false,
  localDayHours: 24.15,
  localYearDays: 426.15,
  localMonthDays: 42.0,
  mainMoonPeriodDays: 41.3
}

// 历法系统默认参数（来自设定文件）
const defaultCalendarSystem: CalendarSystem = {
  smallMonths: 7,
  largeMonths: 3,
  moonFestivalDays: 7,
  sunFestivalDays: 6,
  leapYearCycle: 7,
  leapSunFestivalDays: 1
}

// 默认天体数据
const defaultCelestialBodies: CelestialBody[] = [
  {
    id: 'star-1',
    name: '主恒星',
    type: 'star',
    radius: 8.0, // 设定推导：比太阳略小，1单位=6000km，恒星压缩至可视化比例
    rotationSpeed: 0.01,
    color: '#ffd080', // 合理推测：比太阳稍冷，色温偏暖黄
    emissiveColor: '#ffaa00',
    description: '一颗年轻的黄矮星，为整个恒星系统提供光和热。',
    mass: '0.9 M☉',
    diameter: '~1,200,000 km',
    temperature: '~5,400 K',
  },
  {
    id: 'planet-1',
    name: '宜居行星',
    type: 'planet',
    radius: 2.0, // 设定推导：略小于地球（12000km/6000=2.0）
    distance: 22, // 合理推测：体现"热接收率更低"，比当前 20 稍远
    rotationSpeed: 0.02,
    rotationPeriodHours: 24.15, // 设定明确：本地日 24.15 地球时
    orbitalPeriodDays: 426.15, // 设定明确：公转周期 426.15 本地日
    color: '#4a90d9',
    description: '位于宜居带内的类地行星，拥有海洋、陆地和大气。略小于地球，陆地面积24%，大气更厚，地质活跃。',
    mass: '0.9 M⊕',
    diameter: '~12,000 km',
    temperature: '288 K',
    hasRing: true,
    ringColor: '#a09080',
    ringType: 'rocky', // 设定明确：稀薄岩石环
    textureType: 'earth-like',
    axialTilt: 0.33, // 设定推导：~19°（回归线比地球更狭窄，< 23.5°）
    orbitalElements: createSimpleOrbit(22, 0.025, 0), // 离心率 0.025，倾角 0°（参考平面）
    // 行星特殊参数（来源：设定推导，基于星球设定.txt 第 12-15 行）
    atmosphereThickness: 1.6, // 设定推导：大气更厚
    greenhouseEffect: 1.4, // 设定推导：温室效应更强
    uvResistance: 1.6, // 设定推导：抗紫外更强
    geothermalActivity: 1.5, // 设定推导：地质更活跃，地热能丰富
    heatReceiptRate: 0.85, // 设定推导：热接收率更低
    heatSupplyRate: 1.15, // 设定推导：给热量略高（恒星辐射 + 温室 + 地热补偿）
    tropicNarrowness: 0.8, // 设定推导：回归线更狭窄（与轴倾角 19° 一致）
    landRatio: 0.24, // 设定明确：陆地 24%
    iceCapExtent: 1.3 // 设定推导：冰盖高于地球末次冰盛期
  },
  {
    id: 'moon-1',
    name: '大卫星',
    type: 'moon',
    radius: 0.75, // 设定推导：直径更大（4400km/6000≈0.73）
    distance: 6.0, // 设定推导：距离略远（体现"距离略远"）
    rotationSpeed: 0.03,
    orbitalPeriodDays: 41.3, // 设定明确：绕行周期 41.3 本地日
    color: '#c0c0c0',
    description: '宜居行星的最大卫星，类月球但直径更大距离略远，绕行周期41.3本地日。',
    mass: '0.025 M⊕',
    diameter: '~4,400 km',
    temperature: '220 K',
    parentId: 'planet-1',
    textureType: 'moon-like',
    axialTilt: 0.03, // ~1.7°
    orbitalElements: createSimpleOrbit(6.0, 0.02, 0.03), // 离心率 0.02，倾角 0.03 rad
  },
  {
    id: 'moon-2',
    name: '小卫星A',
    type: 'moon',
    radius: 0.15, // 合理推测：极小卫星（直径约 500 km）
    distance: 6.5, // 合理推测：轨道在大卫星附近
    rotationSpeed: 0.04,
    orbitalPeriodDays: 53.1, // 设定推导：开普勒第三定律，T = 41.3 * (6.5/6.0)^(3/2)
    color: '#a8a8a8',
    description: '一颗极小的岩石卫星，轨道与大卫星同一水平面附近。',
    mass: '0.0001 M⊕',
    diameter: '~500 km',
    temperature: '210 K',
    parentId: 'planet-1',
    axialTilt: 0.04,
    orbitalPlaneOffset: 0.03, // 合理推测：接近大卫星平面
    orbitalElements: createSimpleOrbit(6.5, 0.04, 0.03),
  },
  {
    id: 'moon-3',
    name: '小卫星B',
    type: 'moon',
    radius: 0.12, // 合理推测：极小卫星（直径约 400 km）
    distance: 7.2, // 合理推测：轨道在大卫星外侧
    rotationSpeed: 0.05,
    orbitalPeriodDays: 61.5, // 设定推导：开普勒第三定律，T = 41.3 * (7.2/6.0)^(3/2)
    color: '#989898',
    description: '第二颗极小卫星，轨道与大卫星同一水平面附近。',
    mass: '0.00005 M⊕',
    diameter: '~400 km',
    temperature: '200 K',
    parentId: 'planet-1',
    axialTilt: 0.05,
    orbitalPlaneOffset: 0.04, // 合理推测：接近大卫星平面
    orbitalElements: createSimpleOrbit(7.2, 0.05, 0.04),
  },
  {
    id: 'planet-2',
    name: '红色行星',
    type: 'planet',
    radius: 1.6, // 合理推测：红色行星（10000km/6000≈1.67）
    distance: 35, // 无依据（占位）
    rotationSpeed: 0.018,
    color: '#cd5c5c',
    description: '一颗干燥的红色星球，拥有极地冰盖。设定文件未提及，此行星为推测性扩展。',
    mass: '0.5 M⊕',
    diameter: '~10,000 km',
    temperature: '210 K',
    textureType: 'mars-like',
    axialTilt: 0.44,
    orbitalElements: createSimpleOrbit(35, 0.09, 0.026), // 轨道倾角 ~1.5°（合理推测：类地行星轨道偏离参考面）
  },
  {
    id: 'planet-3',
    name: '气态巨星',
    type: 'planet',
    radius: 6.0, // 合理推测：气态巨星（40000km/6000≈6.67，取整）
    distance: 60, // 无依据（占位）
    rotationSpeed: 0.04,
    color: '#daa520',
    description: '巨大的气态行星，拥有标志性的风暴系统。设定文件未提及，此行星为推测性扩展。',
    mass: '300 M⊕',
    diameter: '~40,000 km',
    temperature: '120 K',
    hasRing: true,
    ringColor: '#c0c0c0',
    textureType: 'gas-giant',
    axialTilt: 0.05,
    orbitalElements: createSimpleOrbit(60, 0.05, 0.044), // 轨道倾角 ~2.5°（合理推测：气态巨星轨道微倾）
  },
]

const defaultDetailPageState: DetailPageState = {
  rotationSpeed: 0.2,
  planetScale: 1,
  showClouds: true,
  cloudSpeed: 0.3,
  showAtmosphere: true,
  textureParams: {
    resolution: '2048',
    terrainRoughness: 0.5,
    cloudCoverage: 0.4,
    cloudOpacity: 0.7,
    atmosphereDensity: 0.6,
    atmosphereColor: '#64a5ff',
    seed: 42
  },
  qualityLevel: 'high',
  dayTime: 0.5,
  yearTime: 0.25,
  globalTime: 0,
  dayNightCycleSpeed: 0.005,
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
  ringParticleRadiusScale: 1.0,
  surfaceObservation: {
    latitude: 0,
    longitude: 0,
    isSurfaceView: false,
    fov: 60,
    atmosphereRefraction: false,
    refractionCoefficient: 0.5,
    markerSizeScale: 1.0,
    showConstellations: true,
    constellationLineWidth: 1.0,
    showEcliptic: true,
    eclipticLineWidth: 1.0,
    showHorizon: true
  }
}

export const useStore = create<StoreState & { celestialBodies: CelestialBody[], detailPageState: DetailPageState }>((set) => ({
  celestialBodies: defaultCelestialBodies,
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
  timeSystem: defaultTimeSystem,
  calendarSystem: defaultCalendarSystem,

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

  setSurfaceObservation: (obs: Partial<SurfaceObservationState>) => set((state) => ({
    detailPageState: {
      ...state.detailPageState,
      surfaceObservation: { ...state.detailPageState.surfaceObservation, ...obs }
    }
  })),

  toggleSurfaceView: () => set((state) => ({
    detailPageState: {
      ...state.detailPageState,
      surfaceObservation: {
        ...state.detailPageState.surfaceObservation,
        isSurfaceView: !state.detailPageState.surfaceObservation.isSurfaceView
      }
    }
  })),

  navigateToDetail: (planetId: string) => {
    set({ currentPage: 'detail', selectedPlanetId: planetId })
    setHash({ page: 'detail', planetId })
  },

  navigateToMain: () => {
    set({ currentPage: 'main', selectedPlanetId: null })
    setHash({ page: 'main' })
  },

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

  // 统一时间系统更新（包含T、timeScale、isPaused及UI参数）
  updateTimeSystem: (updates: Partial<TimeSystem>) => set((state) => ({
    timeSystem: { ...state.timeSystem, ...updates }
  })),

  updateCalendarSystem: (updates: Partial<CalendarSystem>) => set((state) => ({
    calendarSystem: { ...state.calendarSystem, ...updates }
  })),
}))

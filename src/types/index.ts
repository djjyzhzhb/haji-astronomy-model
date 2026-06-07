import type { OrbitalElements } from '../utils/keplerOrbit'
import type { TextureParams } from '../utils/textureGenerator'

export type PageType = 'main' | 'detail'

export interface CelestialBody {
  id: string
  name: string
  type: 'star' | 'planet' | 'moon'
  radius: number
  distance?: number
  orbitSpeed?: number // 保留用于向后兼容
  rotationSpeed?: number
  color: string
  emissiveColor?: string
  description: string
  mass?: string
  diameter?: string
  temperature?: string
  hasRing?: boolean
  ringColor?: string
  parentId?: string
  textureType?: 'none' | 'earth-like' | 'moon-like' | 'mars-like' | 'gas-giant'
  axialTilt?: number // 轴向倾斜角（弧度）
  orbitalElements?: OrbitalElements // 开普勒轨道元素
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type ViewPreset = 'global' | 'equator' | 'north-pole' | 'south-pole' | 'sun-facing';

export interface DetailPageState {
  rotationSpeed: number;
  planetScale: number;
  showClouds: boolean;
  showAtmosphere: boolean;
  textureParams: TextureParams;
  qualityLevel: QualityLevel;
  dayTime: number; // 0-1, 0=midnight, 0.5=noon
  dayNightCycleSpeed: number;
  atmosphereGlowIntensity: number;
  atmosphereInnerRadius: number;
  atmosphereOuterRadius: number;
  viewPreset: ViewPreset;
  axialTilt: number;
  showRing: boolean;
  ringOpacity: number;
  ringEmissiveIntensity: number;
  ringInnerRadiusScale: number;
  ringOuterRadiusScale: number;
  showRingParticles: boolean;
  ringParticleCount: number;
  ringParticleSize: number;
  ringParticleOpacity: number;
  ringParticleRadiusScale: number;
}

export interface StoreState {
  timeScale: number
  isPaused: boolean
  showOrbits: boolean
  selectedBody: CelestialBody | null
  focusBody: CelestialBody | null
  brightness: number
  backgroundBrightness: number
  backgroundColor: string
  showNebula: boolean
  distanceScale: number // 距离缩放
  sizeScale: number     // 大小缩放
  lightIntensity: number // 光照强度
  ambientLight: number   // 环境光强度
  starGlow: number       // 恒星光晕强度
  showAtmosphere: boolean // 显示大气层
  showRings: boolean     // 显示行星环
  showAsteroids: boolean // 显示小行星带
  showDustCloud: boolean // 显示尘埃云
  showShadows: boolean   // 显示阴影
  currentPage: PageType
  selectedPlanetId: string | null
  detailPageState: DetailPageState
  setTimeScale: (scale: number) => void
  togglePause: () => void
  toggleOrbits: () => void
  selectBody: (body: CelestialBody | null) => void
  setFocusBody: (body: CelestialBody | null) => void
  setBrightness: (value: number) => void
  setBackgroundBrightness: (value: number) => void
  setBackgroundColor: (color: string) => void
  setShowNebula: (show: boolean) => void
  setDistanceScale: (value: number) => void
  setSizeScale: (value: number) => void
  setLightIntensity: (value: number) => void
  setAmbientLight: (value: number) => void
  setStarGlow: (value: number) => void
  setShowAtmosphere: (show: boolean) => void
  setShowRings: (show: boolean) => void
  setShowAsteroids: (show: boolean) => void
  setShowDustCloud: (show: boolean) => void
  setShowShadows: (show: boolean) => void
  updateCelestialBody: (id: string, updates: Partial<CelestialBody>) => void
  setCurrentPage: (page: PageType) => void
  setSelectedPlanetId: (id: string | null) => void
  updateDetailPageState: (updates: Partial<DetailPageState>) => void
  updateTextureParams: (updates: Partial<TextureParams>) => void
}

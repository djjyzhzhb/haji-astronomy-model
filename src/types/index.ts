import type { OrbitalElements } from '../utils/keplerOrbit'
// OrbitalElements.meanAnomaly 为历元时刻 T=0 的平近点角（弧度）
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
  rotationPeriodHours?: number // 自转周期（小时）
  orbitalPeriodDays?: number // 公转周期（本地日），用于统一时间T驱动轨道计算
  color: string
  emissiveColor?: string
  description: string
  mass?: string
  diameter?: string
  temperature?: string
  hasRing?: boolean
  ringColor?: string
  ringType?: 'rocky' | 'icy' | 'mixed' // 行星环类型
  ringAsScale?: boolean // 行星环是否作为刻度表
  parentId?: string
  textureType?: 'none' | 'earth-like' | 'moon-like' | 'mars-like' | 'gas-giant'
  axialTilt?: number // 轴向倾斜角（弧度）
  orbitalElements?: OrbitalElements // 开普勒轨道元素
  
  // 行星特殊参数
  atmosphereThickness?: number // 大气厚度系数
  greenhouseEffect?: number // 温室效应强度
  uvResistance?: number // 抗紫外线能力
  geothermalActivity?: number // 地质活跃度
  heatReceiptRate?: number // 热接收率
  heatSupplyRate?: number // 给热量
  tropicNarrowness?: number // 回归线狭窄度
  landRatio?: number // 陆地面积比例 (0-1)
  iceCapExtent?: number // 冰盖范围系数
  
  // 卫星特殊参数
  orbitalPlaneOffset?: number // 轨道平面相对于主卫星的偏移
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type ViewPreset = 'global' | 'equator' | 'north-pole' | 'south-pole' | 'sun-facing';

// 时间系统参数（统一时间源）
export interface TimeSystem {
  T: number // 儒略日（本初子午线春分正午=0，单位：本地日）
  timeScale: number // 全局时间倍速
  isPaused: boolean // 全局暂停
  localDayHours: number // 本地日长度（小时）
  localYearDays: number // 本地年长度（本地日）
  localMonthDays: number // 本地月长度（本地日）
  mainMoonPeriodDays: number // 主卫星周期（本地日）
}

// 历法系统参数
export interface CalendarSystem {
  smallMonths: number // 小月数量（41天）
  largeMonths: number // 大月数量（42天）
  moonFestivalDays: number // 月相日天数
  sunFestivalDays: number // 日相日天数
  leapYearCycle: number // 闰年周期（年）
  leapSunFestivalDays: number // 闰日相日天数
}

export interface SurfaceObservationState {
  latitude: number;
  longitude: number;
  isSurfaceView: boolean;
  fov: number;
  atmosphereRefraction: boolean;
  refractionCoefficient: number; // 0.1°~2.0°
  markerSizeScale: number;       // 0.5x~3.0x
  showConstellations: boolean;
  constellationLineWidth: number; // 0.5~5.0
  showEcliptic: boolean;
  eclipticLineWidth: number;     // 0.5~5.0
  showHorizon: boolean;
}

export interface DetailPageState {
  rotationSpeed: number;
  planetScale: number;
  showClouds: boolean;
  cloudSpeed: number;
  showAtmosphere: boolean;
  textureParams: TextureParams;
  qualityLevel: QualityLevel;
  dayTime: number; // 0-1, 0=midnight, 0.5=noon (从 globalTime 派生) /** @deprecated 改为从 timeSystem.T 派生 */
  yearTime: number; // 0-1, 默认0.25代表春季 (从 globalTime 派生) /** @deprecated 改为从 timeSystem.T 派生 */
  globalTime: number; // 全局时间（秒），统一驱动所有天体运动 /** @deprecated 改为从 timeSystem.T 派生 */
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
  surfaceObservation: SurfaceObservationState;
}

export interface StoreState {
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
  timeSystem: TimeSystem // 时间系统参数
  calendarSystem: CalendarSystem // 历法系统参数
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
  setSurfaceObservation: (obs: Partial<SurfaceObservationState>) => void
  toggleSurfaceView: () => void
  navigateToDetail: (planetId: string) => void
  navigateToMain: () => void
  updateTimeSystem: (updates: Partial<TimeSystem>) => void // 统一时间系统更新（包含T、timeScale、isPaused及UI参数）
  updateCalendarSystem: (updates: Partial<CalendarSystem>) => void
}

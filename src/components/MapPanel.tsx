import { X, GripVertical } from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { sunEclipticHigh, eclipticToEquatorial } from '../utils/astronomy'
import { useStore } from '../store'

interface MapPanelProps {
  open: boolean
  onClose: () => void
  textureUrl: string | null
  planetName: string
  onSelectPoint?: (lat: number, lon: number) => void
  dayNightCycleSpeed?: number
  rotationSpeed?: number
  axialTilt?: number
  localYearDays?: number
}

function normalizeLonDeg(lon: number): number {
  let x = lon % 360
  if (x > 180) x -= 360
  if (x < -180) x += 360
  return x
}

function fmtLon(lon: number): string {
  const abs = Math.abs(lon)
  const sign = lon >= 0 ? 'E' : 'W'
  return `${abs.toFixed(1)}°${sign}`
}

function fmtLat(lat: number): string {
  const abs = Math.abs(lat)
  const sign = lat >= 0 ? 'N' : 'S'
  return `${abs.toFixed(1)}°${sign}`
}

// —— 与 PlanetMesh 中 useFrame 完全相同的公式，保证自转/公转速度同步 ——
//
// 关键坐标约定（Three.js 右手坐标系，Y 朝上）：
//   DetailPage.tsx 中行星被嵌套在一个 group(rotation.x = axialTilt) 内，
//   同时 mesh.rotation.y = planetRot （随 T 累加 = T * rotationSpeed * cs * 2π）
//   所以本地顶点 p_local → world = Rx(axialTilt) * Ry(planetRot) * p_local
//
//   shader 中使用的 sunDirection = sunRef.current，而 DetailPage 计算：
//     sunRef.set(cosDec*sin(RA), sinDec, cosDec*cos(RA))
//     sunRef.applyMatrix4(makeRotationX(axialTilt))   ← 对太阳方向也施加 Rx(axialTilt)
//   即：sunDirection_world = Rx(axialTilt) * sun_base
//
//   日下条件（local_sun = 行星本地帧中指向太阳的方向）：
//     Rx(axialTilt) * Ry(planetRot) * local_sun || Rx(axialTilt) * sun_base
//   消去两侧的 Rx(axialTilt)：  Ry(planetRot) * local_sun || sun_base
//   所以：                       local_sun = Ry(-planetRot) * sun_base
//
//   结论：**倾角在两者上相互抵消，不要在本地坐标计算中再施加一次倾角**！
//
//   Three.js Ry(θ)：  x' = x·cos(θ) + z·sin(θ),  z' = -x·sin(θ) + z·cos(θ)
//   Three.js Ry(-θ)： x' = x·cos(θ) - z·sin(θ),  z' = x·sin(θ) + z·cos(θ)
//
//   经度：SphereGeometry 顶点 x = -R·cos(θ)·sin(φ), z = R·sin(θ)·sin(φ)
//         u = θ/(2π),  lon = (θ - π)·180/π = atan2(-z, x)·180/π
function computeAstronomy(
  T: number,
  cs: number,
  rotationSpeed: number,
  _axialTilt: number, // 倾角被 group 与 shader 同时施加而抵消，本地帧计算不需要
) {
  const effectiveT = T * cs
  const [sunLon, epsPrime] = sunEclipticHigh(effectiveT)
  const [sunRA, sunDec] = eclipticToEquatorial(sunLon, 0, epsPrime)
  const cosDec = Math.cos(sunDec)

  // sun_base（未倾斜的太阳方向），与 DetailPage 中 set() 之后、applyMatrix4(tilt) 之前的值一致
  const sx = cosDec * Math.sin(sunRA)
  const sz = cosDec * Math.cos(sunRA)

  // 行星自转角度，与 DetailPage planetRotRef.current 同步
  const rotationAngle = T * rotationSpeed * cs * 2 * Math.PI

  // Ry(-rotationAngle)：把太阳方向反向旋转到行星本地纹理坐标帧
  const cosRot = Math.cos(rotationAngle)
  const sinRot = Math.sin(rotationAngle)
  const xLocal = sx * cosRot - sz * sinRot
  const zLocal = sx * sinRot + sz * cosRot

  // 本地坐标 → 贴图经度（SphereGeometry UV 推导：lon = atan2(-z, x) · 180/π）
  const subsolarLonRad = Math.atan2(-zLocal, xLocal)

  return {
    sunDeclination: sunDec * 180 / Math.PI,
    subsolarLon: normalizeLonDeg(subsolarLonRad * 180 / Math.PI),
    dayPhase: ((T * rotationSpeed * cs) % 1 + 1) % 1,
    sunLonRad: sunLon,
  }
}

// 根据太阳直射点计算晨昏圈（圆柱投影地图上的 S 形曲线）
// 公式：对任意经度 lon，晨昏圈纬度 lat 满足
//   sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(lon - lon_sun) = 0
// → tan(lat) = -tan(dec) * cos(lon - lon_sun)
function computeTerminatorPoints(
  decDeg: number,
  subsolarLonDeg: number,
): { lonDeg: number; latDeg: number }[] {
  const pts: { lonDeg: number; latDeg: number }[] = []
  const decRad = decDeg * Math.PI / 180
  const tanDec = Math.tan(decRad)
  const step = 3
  for (let lon = -180; lon <= 180; lon += step) {
    const dLon = (lon - subsolarLonDeg) * Math.PI / 180
    const tanLat = -tanDec * Math.cos(dLon)
    const lat = Math.atan(tanLat) * 180 / Math.PI
    pts.push({ lonDeg: lon, latDeg: lat })
  }
  return pts
}

function computePolarCircle(decDeg: number): number {
  return 90 - Math.abs(decDeg)
}

function MapPanel({
  open,
  onClose,
  textureUrl,
  planetName,
  onSelectPoint,
  dayNightCycleSpeed = 1.0,
  rotationSpeed = 1.0,
  axialTilt = 0.33,
  localYearDays = 426.15,
}: MapPanelProps) {
  const [width, setWidth] = useState(320)
  const [isDragging, setIsDragging] = useState(false)
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tickRef = useRef<number | null>(null)
  const [, forceUpdate] = useState(0)

  // 4Hz 刷新 —— 不抢主线程，同时足够平滑
  useEffect(() => {
    if (!open) return
    const tick = () => {
      forceUpdate((n) => (n + 1) % 1000000)
    }
    tickRef.current = window.setInterval(tick, 250) as unknown as number
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [open])

  // 从 store 取时间（非响应式，由 setInterval 触发重算）
  const T = useStore.getState().timeSystem.T
  const astro = computeAstronomy(T, dayNightCycleSpeed, rotationSpeed, axialTilt)
  const terminator = computeTerminatorPoints(astro.sunDeclination, astro.subsolarLon)

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const imgWidth = rect.width
    const imgHeight = rect.height
    if (x < 0 || x > imgWidth || y < 0 || y > imgHeight) return
    const lonDeg = (x / imgWidth) * 360 - 180
    const latDeg = 90 - (y / imgHeight) * 180
    setMarker({ x, y })
    onSelectPoint?.(latDeg * Math.PI / 180, lonDeg * Math.PI / 180)
  }, [onSelectPoint])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartWidth.current = width
  }, [width])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const delta = dragStartX.current - e.clientX
    const newWidth = Math.min(600, Math.max(200, dragStartWidth.current + delta))
    setWidth(newWidth)
  }, [])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const lonToPct = (lonDeg: number) => (lonDeg + 180) / 360
  const sunLonPct = lonToPct(astro.subsolarLon)
  const sunriseLonPct = lonToPct(normalizeLonDeg(astro.subsolarLon - 90))
  const sunsetLonPct = lonToPct(normalizeLonDeg(astro.subsolarLon + 90))
  const yearProgress = (astro.sunLonRad + Math.PI) / (2 * Math.PI)

  // —— 动态昼夜经度渐变：亮黄带中心 = 太阳直射经度，半宽 90°（1/4 条宽）——
  // 即整条条的 50% 是昼半球，直射经度 ± 90° 精确对应日出/日落
  // 用分段线性渐变，中心最亮，±90° 处刚好变成黑夜色
  const cNight = '#0b1220'     // 深夜
  const cDusk = '#1e3a5f'       // 晨昏（日出/日落）
  const cDay = '#fef3c7'        // 正午
  const pctStop = (pct: number, color: string) =>
    `${color} ${(Math.max(0, Math.min(1, pct)) * 100).toFixed(2)}%`
  const stops = [
    pctStop(0, cNight),
    pctStop(sunriseLonPct - 0.02, cNight),
    pctStop(sunriseLonPct, cDusk),
    pctStop(sunLonPct, cDay),
    pctStop(sunsetLonPct, cDusk),
    pctStop(sunsetLonPct + 0.02, cNight),
    pctStop(1, cNight),
  ]
  const dayNightGradient = `linear-gradient(to right, ${stops.join(', ')})`

  return (
    <div
      ref={containerRef}
      className={`fixed top-0 right-0 h-full bg-gray-800/90 backdrop-blur-sm rounded-l-xl shadow-2xl border-l border-gray-600 z-40 transition-transform duration-300 ease-in-out max-md:w-[60vw] ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width, touchAction: 'none' }}
      onTouchMove={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group z-10 max-md:hidden"
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-full bg-gray-600 group-hover:bg-blue-500 transition-colors rounded-full" />
        <GripVertical size={14} className="absolute text-gray-500 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
      </div>

      <div className="flex items-center justify-between px-4 py-3 max-md:px-2 max-md:py-1.5 border-b border-gray-700/50">
        <div>
          <h2 className="text-white font-bold text-lg truncate pr-2 max-md:text-sm">{planetName}</h2>
          <div className="text-gray-400 text-[10px] max-md:text-[8px] mt-0.5">
            自转日 {(T * rotationSpeed * dayNightCycleSpeed).toFixed(2)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white flex-shrink-0"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 max-md:p-2 h-[calc(100%-57px)] max-md:h-[calc(100%-40px)] overflow-y-auto">
        {textureUrl ? (
          <div>
            {/* ===== 昼夜经度条 =====
                亮黄带中心 = 此刻太阳直射经度，随行星自转而在经度条上移动
                （亮的地方 = 白天，暗的地方 = 夜晚） */}
            <div className="mb-3 max-md:mb-2">
              <div className="flex justify-between text-[11px] text-gray-400 mb-1 max-md:text-[9px]">
                <span>直射: {fmtLat(astro.sunDeclination)}, {fmtLon(astro.subsolarLon)}</span>
                <span className="text-yellow-300">太阳直射经度</span>
              </div>
              <div
                className="relative w-full h-4 rounded-md overflow-hidden"
                style={{ background: dayNightGradient }}
              />
              <div className="relative mt-1 text-[10px] text-gray-500 max-md:text-[8px] h-3">
                <span className="absolute left-0">-180°</span>
                <span className="absolute left-1/4 -translate-x-1/2">-90°</span>
                <span className="absolute left-1/2 -translate-x-1/2">0°</span>
                <span className="absolute left-3/4 -translate-x-1/2">+90°</span>
                <span className="absolute right-0">+180°</span>
              </div>
            </div>

            {/* ===== 年进度条 ===== */}
            <div className="mb-3 max-md:mb-2">
              <div className="flex justify-between text-[11px] text-gray-400 mb-1 max-md:text-[9px]">
                <span>年进度 {localYearDays.toFixed(0)}天 / {(yearProgress * localYearDays).toFixed(1)}天</span>
                <span className="text-blue-300">
                  {astro.sunDeclination >= 0 ? '夏半年' : '冬半年'}
                </span>
              </div>
              <div
                className="relative w-full h-4 rounded-md overflow-hidden"
                style={{ background: 'linear-gradient(to right, #1e3a8a 0%, #60a5fa 25%, #fef3c7 50%, #60a5fa 75%, #1e3a8a 100%)' }}
              >
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-300"
                  style={{ left: `${yearProgress * 100}%` }}
                />
                <div className="absolute top-0 bottom-0 w-px bg-gray-400/60" style={{ left: '25%' }} />
                <div className="absolute top-0 bottom-0 w-px bg-gray-400/60" style={{ left: '50%' }} />
                <div className="absolute top-0 bottom-0 w-px bg-gray-400/60" style={{ left: '75%' }} />
              </div>
              <div className="relative mt-1 text-[10px] text-gray-500 max-md:text-[8px] h-3">
                <span className="absolute left-0 -translate-x-1/2">冬至</span>
                <span className="absolute left-1/4 -translate-x-1/2">春分</span>
                <span className="absolute left-1/2 -translate-x-1/2">夏至</span>
                <span className="absolute left-3/4 -translate-x-1/2">秋分</span>
                <span className="absolute right-0 translate-x-1/2">冬至</span>
              </div>
            </div>

            {/* ===== 地图 + 叠加层 ===== */}
            <div className="relative cursor-crosshair" onClick={handleMapClick}>
              <img
                ref={imgRef}
                src={textureUrl}
                alt={`${planetName} 地图`}
                className="w-full h-auto rounded-lg object-contain select-none"
                draggable={false}
              />
              {/* 太阳直射经度竖线（贯穿整张地图） */}
              <div
                className="absolute top-0 bottom-0 bg-yellow-300/80 pointer-events-none"
                style={{ left: `${sunLonPct * 100}%`, width: 2, boxShadow: '0 0 6px rgba(253, 224, 71, 0.7)' }}
              />
              {/* 直射点标记（赤道上的圆点） */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${sunLonPct * 100}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, #fde047 0%, #fbbf24 100%)',
                  boxShadow: '0 0 10px rgba(253, 224, 71, 0.9), 0 0 20px rgba(251, 191, 36, 0.5)',
                }}
              />
              {/* 晨昏圈 S 形曲线 */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none rounded-lg overflow-hidden"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <polyline
                  points={terminator.map((p) => `${((p.lonDeg + 180) / 360) * 100},${((90 - p.latDeg) / 180) * 100}`).join(' ')}
                  fill="none"
                  stroke="rgba(251, 191, 36, 0.55)"
                  strokeWidth="0.5"
                  strokeDasharray="1.2,1.2"
                />
              </svg>
              {/* 点击标记 */}
              {marker && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: marker.x,
                    top: marker.y,
                    transform: 'translate(-50%, -50%)',
                    width: 20,
                    height: 20,
                  }}
                >
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-full bg-red-500" style={{ boxShadow: '0 0 4px rgba(239,68,68,0.8)' }} />
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-full bg-red-500" style={{ boxShadow: '0 0 4px rgba(239,68,68,0.8)' }} />
                </div>
              )}
            </div>

            <div className="mt-2 text-[10px] text-gray-500 max-md:text-[8px]">
              极昼极夜边界: ±{computePolarCircle(astro.sunDeclination).toFixed(1)}°
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            无地图数据
          </div>
        )}
      </div>
    </div>
  )
}

export default MapPanel

import { X, GripVertical } from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { sunEclipticHigh, eclipticToEquatorial } from '../utils/astronomy'

// ===== Perlin 噪声函数（用于云层） =====

function hash3D(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 144067249
  h = (h ^ (h >> 13)) * 1274126177
  return (h ^ (h >> 16)) / 2147483648 + 0.5
}

function smoothNoise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz)
  const n000 = hash3D(ix, iy, iz), n100 = hash3D(ix + 1, iy, iz)
  const n010 = hash3D(ix, iy + 1, iz), n110 = hash3D(ix + 1, iy + 1, iz)
  const n001 = hash3D(ix, iy, iz + 1), n101 = hash3D(ix + 1, iy, iz + 1)
  const n011 = hash3D(ix, iy + 1, iz + 1), n111 = hash3D(ix + 1, iy + 1, iz + 1)
  return (1 - sz) * ((1 - sy) * ((1 - sx) * n000 + sx * n100) + sy * ((1 - sx) * n010 + sx * n110))
    + sz * ((1 - sy) * ((1 - sx) * n001 + sx * n101) + sy * ((1 - sx) * n011 + sx * n111))
}

function fbm3D(x: number, y: number, z: number, octaves: number = 5): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise3D(x * frequency, y * frequency, z * frequency)
    maxValue += amplitude
    amplitude *= 0.55
    frequency *= 2.3
  }
  return value / maxValue
}

// ===== 组件 =====

interface MapPanelProps {
  open: boolean
  onClose: () => void
  textureUrl: string | null
  planetName: string
  onSelectPoint?: (lat: number, lon: number) => void
  dayTime?: number       // 0-1, 0.5 = 正午
  yearProgress?: number  // 0-1, 年份进度
  axialTilt?: number     // 轴倾角（弧度），默认 0.33 (~19°)
  globalTime?: number    // 全局时间，用于云层动画
}

function MapPanel({ open, onClose, textureUrl, planetName, onSelectPoint, dayTime = 0.5, yearProgress = 0.25, axialTilt = 0.33, globalTime = 0 }: MapPanelProps) {
  const [width, setWidth] = useState(320)
  const [isDragging, setIsDragging] = useState(false)
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const [terrainMaskVersion, setTerrainMaskVersion] = useState(0)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terrainMaskRef = useRef<Uint8Array | null>(null)

  // ===== 地形检测：分析海陆掩码（仅运行一次） =====
  useEffect(() => {
    const img = imgRef.current
    if (!img || !textureUrl) return

    const analyzeTerrain = () => {
      try {
        const offscreen = document.createElement('canvas')
        offscreen.width = img.naturalWidth
        offscreen.height = img.naturalHeight
        const octx = offscreen.getContext('2d')
        if (!octx) return

        octx.drawImage(img, 0, 0)
        const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height)
        const data = imageData.data
        const mask = new Uint8Array(offscreen.width * offscreen.height)

        for (let i = 0; i < mask.length; i++) {
          const r = data[i * 4]
          const g = data[i * 4 + 1]
          const b = data[i * 4 + 2]

          // 饱和度计算：max-min
          const maxC = Math.max(r, g, b)
          const minC = Math.min(r, g, b)
          const saturation = maxC > 0 ? (maxC - minC) / maxC : 0

          const isLand =
            (g > r * 1.05 && g > b * 1.1 && saturation > 0.08)
          const isOcean =
            (b > r * 1.1 && b > g * 1.05)

          // 陆地优先：如果同时满足则判定为陆地
          mask[i] = isLand ? 255 : (isOcean ? 0 : 0)
        }

        terrainMaskRef.current = mask
        setTerrainMaskVersion(v => v + 1)
      } catch {
        // 跨域图片可能导致 canvas 污染，静默失败
      }
    }

    if (img.complete && img.naturalWidth > 0) {
      analyzeTerrain()
    } else {
      const onLoad = () => analyzeTerrain()
      img.addEventListener('load', onLoad)
      return () => img.removeEventListener('load', onLoad)
    }
  }, [textureUrl])

  // ===== 地势光照 + 云层（terrain canvas） =====
  useEffect(() => {
    const terrainCanvas = terrainCanvasRef.current
    const container = containerRef.current
    if (!terrainCanvas || !container) return

    const img = imgRef.current
    if (!img) return

    const rect = img.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (w === 0 || h === 0) return

    // 设置 terrain canvas 尺寸与图片一致
    const dpr = window.devicePixelRatio || 1
    terrainCanvas.width = w * dpr
    terrainCanvas.height = h * dpr
    terrainCanvas.style.width = w + 'px'
    terrainCanvas.style.height = h + 'px'
    terrainCanvas.style.left = (rect.left - containerRect.left) + 'px'
    terrainCanvas.style.top = (rect.top - containerRect.top) + 'px'

    const ctx = terrainCanvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)

    // 计算太阳直射点
    const sunLam = sunEclipticHigh(yearProgress)[0]
    const declination = eclipticToEquatorial(sunLam, 0, axialTilt)[1]
    const subsolarLatDeg = declination * 180 / Math.PI
    let subsolarLonDeg = -(dayTime - 0.5) * 360
    subsolarLonDeg = ((subsolarLonDeg + 540) % 360) - 180

    const subsolarLatRad = declination
    const subsolarLonRad = subsolarLonDeg * Math.PI / 180

    // 地势光照强度：太阳赤纬越大，地表起伏越明显
    const gradientStrength = Math.min(1, Math.abs(declination) / Math.max(0.01, axialTilt))

    // 海陆掩码
    const mask = terrainMaskRef.current
    const maskWidth = img.naturalWidth
    const maskHeight = img.naturalHeight

    // 云层偏移
    const cloudOffsetX = globalTime * 0.015

    const imageData = ctx.createImageData(w, h)
    const data = imageData.data

    for (let py = 0; py < h; py++) {
      const latDeg = 90 - (py / h) * 180
      const latRad = latDeg * Math.PI / 180

      for (let px = 0; px < w; px++) {
        const lonDeg = (px / w) * 360 - 180
        const lonRad = lonDeg * Math.PI / 180

        const idx = (py * w + px) * 4
        let r = 0, g = 0, b = 0, a = 0

        // --- 地势光照（仅陆地） ---
        const isLand = (() => {
          if (!mask || maskWidth === 0 || maskHeight === 0) return false
          const mx = Math.floor((px / w) * maskWidth)
          const my = Math.floor((py / h) * maskHeight)
          const mi = my * maskWidth + mx
          return mi < mask.length && mask[mi] === 255
        })()

        if (isLand) {
          // 计算像素与太阳直射点的角距离
          const cosDist = Math.sin(subsolarLatRad) * Math.sin(latRad)
            + Math.cos(subsolarLatRad) * Math.cos(latRad) * Math.cos(lonRad - subsolarLonRad)

          // cosDist > 0 表示朝向太阳，< 0 表示背向太阳
          const facing = cosDist // 范围 [-1, 1]

          if (facing > 0) {
            // 朝向太阳：暖色亮色调
            const alpha = facing * gradientStrength * 0.12
            r = 255
            g = 255
            b = 180
            a = Math.round(Math.min(1, alpha) * 255)
          } else {
            // 背向太阳：暗色调
            const alpha = (-facing) * gradientStrength * 0.08
            r = 0
            g = 0
            b = 0
            a = Math.round(Math.min(1, alpha) * 255)
          }
        }

        // --- 云层（所有像素） ---
        const cloudX = (px / w) * 6 + cloudOffsetX
        const cloudY = (py / h) * 3
        const cloudZ = 0.5
        const fbmVal = fbm3D(cloudX, cloudY, cloudZ)
        const cloudNoise = (fbmVal - 0.3) / 0.4 // 映射到 [0, 1]

        if (cloudNoise > 0.55) {
          // smoothstep: t = cloudNoise, edge0=0.55, edge1=0.7
          const t = Math.max(0, Math.min(1, (cloudNoise - 0.55) / (0.7 - 0.55)))
          const cloudAlpha = t * 0.45

          // Alpha 混合：云层叠加在地势光照之上
          const cloudA = Math.round(cloudAlpha * 255)
          const blend = cloudAlpha
          r = Math.round(r * (1 - blend) + 255 * blend)
          g = Math.round(g * (1 - blend) + 255 * blend)
          b = Math.round(b * (1 - blend) + 255 * blend)
          a = Math.round(a * (1 - blend) + cloudA * blend)
        }

        data[idx] = r
        data[idx + 1] = g
        data[idx + 2] = b
        data[idx + 3] = a
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [dayTime, yearProgress, axialTilt, globalTime, terrainMaskVersion])

  // ===== 昼夜阴影（增强陆地夜间暗度） =====
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const img = imgRef.current
    if (!img) return

    const rect = img.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (w === 0 || h === 0) return

    // 设置 canvas 尺寸与图片一致
    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    canvas.style.left = (rect.left - containerRect.left) + 'px'
    canvas.style.top = (rect.top - containerRect.top) + 'px'

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)

    // 计算太阳直射点
    const sunLam = sunEclipticHigh(yearProgress)[0]
    const declination = eclipticToEquatorial(sunLam, 0, axialTilt)[1]
    const subsolarLatDeg = declination * 180 / Math.PI
    let subsolarLonDeg = -(dayTime - 0.5) * 360
    subsolarLonDeg = ((subsolarLonDeg + 540) % 360) - 180

    const subsolarLatRad = declination
    const subsolarLonRad = subsolarLonDeg * Math.PI / 180

    const twilightZone = 5 * Math.PI / 180  // 5° 晨昏过渡带

    // 海陆掩码
    const mask = terrainMaskRef.current
    const maskWidth = img.naturalWidth
    const maskHeight = img.naturalHeight

    // 每像素绘制
    const imageData = ctx.createImageData(w, h)
    const data = imageData.data

    for (let py = 0; py < h; py++) {
      const latDeg = 90 - (py / h) * 180
      const latRad = latDeg * Math.PI / 180

      for (let px = 0; px < w; px++) {
        const lonDeg = (px / w) * 360 - 180
        const lonRad = lonDeg * Math.PI / 180

        // 计算与太阳直射点的角距离
        const cosDist = Math.sin(subsolarLatRad) * Math.sin(latRad)
          + Math.cos(subsolarLatRad) * Math.cos(latRad) * Math.cos(lonRad - subsolarLonRad)
        const dist = Math.acos(Math.max(-1, Math.min(1, cosDist)))

        // 夜间一侧：dist > 90° 为黑夜
        let nightAlpha = Math.min(1, Math.max(0,
          (dist - (Math.PI / 2 - twilightZone)) / (2 * twilightZone)
        ))

        // 增强陆地夜间暗度
        const isLand = (() => {
          if (!mask || maskWidth === 0 || maskHeight === 0) return false
          const mx = Math.floor((px / w) * maskWidth)
          const my = Math.floor((py / h) * maskHeight)
          const mi = my * maskWidth + mx
          return mi < mask.length && mask[mi] === 255
        })()

        const enhancedNight = Math.min(1, nightAlpha + (isLand ? 0.25 : 0))

        const idx = (py * w + px) * 4
        data[idx] = 0       // R
        data[idx + 1] = 0   // G
        data[idx + 2] = 10  // B (微蓝调模拟月光)
        data[idx + 3] = Math.round(enhancedNight * 180) // A (半透明)
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [dayTime, yearProgress, axialTilt, terrainMaskVersion])

  // 监听窗口大小变化和图片加载
  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
      const terrainCanvas = terrainCanvasRef.current
      if (terrainCanvas) {
        terrainCanvas.width = 0
        terrainCanvas.height = 0
      }
    }

    const handleLoad = () => handleResize()
    img.addEventListener('load', handleLoad)
    window.addEventListener('resize', handleResize)

    // 初始绘制（图片可能已加载）
    const timer = setTimeout(handleResize, 100)

    return () => {
      img.removeEventListener('load', handleLoad)
      window.removeEventListener('resize', handleResize)
      clearTimeout(timer)
    }
  }, [open])

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

  return (
    <div
      className={`fixed top-0 right-0 h-full bg-gray-800/90 backdrop-blur-sm rounded-l-xl shadow-2xl border-l border-gray-600 z-40 transition-transform duration-300 ease-in-out max-md:w-[60vw] ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width }}
    >
      <div
        className="absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group z-10 max-md:hidden"
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-full bg-gray-600 group-hover:bg-blue-500 transition-colors rounded-full" />
        <GripVertical size={14} className="absolute text-gray-500 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
      </div>

      <div className="flex items-center justify-between px-4 py-3 max-md:px-2 max-md:py-1.5 border-b border-gray-700/50">
        <h2 className="text-white font-bold text-lg truncate pr-2 max-md:text-sm">{planetName}</h2>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white flex-shrink-0"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 max-md:p-2 h-[calc(100%-57px)] max-md:h-[calc(100%-40px)]">
        {textureUrl ? (
          <div
            ref={containerRef}
            className="relative cursor-crosshair"
            onClick={handleMapClick}
          >
            <img
              ref={imgRef}
              src={textureUrl}
              alt={`${planetName} 地图`}
              className="w-full h-auto rounded-lg object-contain"
              draggable={false}
            />
            {/* 地势光照 + 云层 */}
            <canvas
              ref={terrainCanvasRef}
              className="absolute top-0 left-0 pointer-events-none rounded-lg"
            />
            {/* 昼夜阴影覆盖层 */}
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 pointer-events-none rounded-lg"
              style={{ mixBlendMode: 'multiply' }}
            />
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
                <div
                  className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-full bg-red-500"
                  style={{ boxShadow: '0 0 4px rgba(239, 68, 68, 0.8)' }}
                />
                <div
                  className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-full bg-red-500"
                  style={{ boxShadow: '0 0 4px rgba(239, 68, 68, 0.8)' }}
                />
              </div>
            )}
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
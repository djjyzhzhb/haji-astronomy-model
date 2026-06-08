import { X, GripVertical } from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { calculateSunDeclination } from '../utils/calendar'

interface MapPanelProps {
  open: boolean
  onClose: () => void
  textureUrl: string | null
  planetName: string
  onSelectPoint?: (lat: number, lon: number) => void
  dayTime?: number       // 0-1, 0.5 = 正午
  yearProgress?: number  // 0-1, 年份进度
  axialTilt?: number     // 轴倾角（弧度），默认 0.33 (~19°)
}

function MapPanel({ open, onClose, textureUrl, planetName, onSelectPoint, dayTime = 0.5, yearProgress = 0.25, axialTilt = 0.33 }: MapPanelProps) {
  const [width, setWidth] = useState(320)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900 && window.innerHeight < 500)
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px) and (max-height: 499px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 绘制昼夜阴影
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
    const declination = calculateSunDeclination(yearProgress, axialTilt)
    const subsolarLatDeg = declination * 180 / Math.PI
    let subsolarLonDeg = -(dayTime - 0.5) * 360
    // 归一化到 [-180, 180]
    subsolarLonDeg = ((subsolarLonDeg + 540) % 360) - 180

    const subsolarLatRad = declination
    const subsolarLonRad = subsolarLonDeg * Math.PI / 180

    const twilightZone = 5 * Math.PI / 180  // 5° 晨昏过渡带

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
        const nightAlpha = Math.min(1, Math.max(0,
          (dist - (Math.PI / 2 - twilightZone)) / (2 * twilightZone)
        ))

        const idx = (py * w + px) * 4
        data[idx] = 0       // R
        data[idx + 1] = 0   // G
        data[idx + 2] = 10  // B (微蓝调模拟月光)
        data[idx + 3] = Math.round(nightAlpha * 180) // A (半透明)
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [dayTime, yearProgress, axialTilt])

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
      className={`fixed top-0 right-0 h-full bg-gray-800/90 backdrop-blur-sm rounded-l-xl shadow-2xl border-l border-gray-600 z-40 transition-transform duration-300 ease-in-out landscape-mobile:w-[60vw] ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={isMobile ? {} : { width }}
    >
      <div
        className="absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group z-10 landscape-mobile:hidden"
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-full bg-gray-600 group-hover:bg-blue-500 transition-colors rounded-full" />
        <GripVertical size={14} className="absolute text-gray-500 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
      </div>

      <div className="flex items-center justify-between px-4 py-3 landscape-mobile:px-2 landscape-mobile:py-1.5 border-b border-gray-700/50">
        <h2 className="text-white font-bold text-lg truncate pr-2 landscape-mobile:text-sm">{planetName}</h2>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white flex-shrink-0"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 landscape-mobile:p-2 h-[calc(100%-57px)] landscape-mobile:h-[calc(100%-40px)]">
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
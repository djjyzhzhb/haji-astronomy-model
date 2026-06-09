import { useState, useCallback, useRef } from 'react'
import { useStore } from '../store'
import {
  Play, Pause, FastForward, Rewind, ChevronUp,
  Settings, Globe, Eye, Maximize2, Minimize2,
  CircleOff, Gauge
} from 'lucide-react'
import type { CelestialBody } from '../types'

interface ControlPanelProps {
  isMobilePortrait: boolean
  isMobileLandscape: boolean
  isMobile: boolean
}

export default function ControlPanel({ isMobilePortrait, isMobileLandscape, isMobile }: ControlPanelProps) {
  const {
    celestialBodies,
    timeSystem,
    updateTimeSystem,
    distanceScale,
    setDistanceScale,
    showOrbits,
    toggleOrbits,
    selectedBody,
    selectBody,
    setFocusBody,
    showNebula,
    setShowNebula,
    showAtmosphere,
    setShowAtmosphere,
    showRings,
    setShowRings,
    showDustCloud,
    setShowDustCloud,
    navigateToDetail,
  } = useStore()

  const [mobileExpanded, setMobileExpanded] = useState(false)

  const timeScaleSliderRef = useRef<HTMLInputElement>(null)

  const [inputValue, setInputValue] = useState<string>(timeSystem.timeScale.toFixed(1))

  // 将线性 slider 值 (0-100) 转换为对数实际值 (0.1-10000)
  // slider 0 → 0.1, slider 50 → 10, slider 100 → 10000 (对数分布)
  const sliderToActual = (sliderValue: number): number => {
    // log10(0.1) = -1, log10(10000) = 4 → 范围 [-1, 4] 共5个数量级
    // slider 范围 0.1-10000 映射到 [-1, 4]
    const logMin = Math.log10(0.1)  // -1
    const logMax = Math.log10(10000) // 4
    const fraction = (sliderValue - 0.1) / (10000 - 0.1)
    const logVal = logMin + fraction * (logMax - logMin)
    return Math.pow(10, logVal)
  }

  const actualToSlider = (actualValue: number): number => {
    // 反变换：实际值 → slider 位置
    const logMin = Math.log10(0.1)
    const logMax = Math.log10(10000)
    const logVal = Math.log10(actualValue)
    const fraction = (logVal - logMin) / (logMax - logMin)
    return 0.1 + fraction * (10000 - 0.1)
  }

  const actualToDisplay = (actualValue: number): string => {
    if (actualValue >= 1000) return actualValue.toFixed(0)
    if (actualValue >= 100) return actualValue.toFixed(0)
    if (actualValue >= 10) return actualValue.toFixed(1)
    if (actualValue >= 1) return actualValue.toFixed(1)
    return actualValue.toFixed(1)
  }

  const handleTogglePause = useCallback(() => {
    updateTimeSystem({ isPaused: !timeSystem.isPaused })
  }, [timeSystem.isPaused, updateTimeSystem])

  const handleTimeScaleChange = useCallback((actualValue: number) => {
    actualValue = Math.max(0.1, Math.min(10000, actualValue))
    updateTimeSystem({ timeScale: actualValue })
    setInputValue(actualToDisplay(actualValue))
  }, [updateTimeSystem])

  const handleSliderChange = useCallback((sliderValue: number) => {
    const actual = sliderToActual(sliderValue)
    handleTimeScaleChange(actual)
  }, [handleTimeScaleChange])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])

  const handleInputCommit = useCallback(() => {
    const parsed = parseFloat(inputValue)
    if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 10000) {
      handleTimeScaleChange(parsed)
    } else {
      // 无效值恢复显示
      setInputValue(actualToDisplay(timeSystem.timeScale))
    }
  }, [inputValue, timeSystem.timeScale, handleTimeScaleChange])

  const resetTimeScale = useCallback(() => {
    handleTimeScaleChange(10.0)  // 默认10 → 物理速度 1.0 本地日/秒
    if (timeScaleSliderRef.current) {
      timeScaleSliderRef.current.value = actualToSlider(10.0).toString()
    }
  }, [handleTimeScaleChange])

  const handleFocusBody = useCallback((body: CelestialBody) => {
    selectBody(body)
    if (body.id === 'planet-1') {
      const planet = celestialBodies.find(b => b.id === body.id)
      if (planet) {
        setDistanceScale(Math.min(5, Math.max(0.5, ((planet.radius * 15) / 50))))
      }
    }
    setFocusBody(body)
  }, [selectBody, celestialBodies, setFocusBody, setDistanceScale])

  const handlePlanetClick = useCallback((planet: CelestialBody) => {
    navigateToDetail(planet.id)
  }, [navigateToDetail])

  // 增减步长：0.1x倍数步进（对数步）
  const changeSpeed = useCallback((direction: -1 | 1) => {
    const current = timeSystem.timeScale
    // 按十倍程移动：每一步×10^0.1 ≈ 1.2589，方便微调
    const step = direction === 1 ? Math.pow(10, 0.1) : 1 / Math.pow(10, 0.1)
    let next = current * step
    next = Math.max(0.1, Math.min(10000, next))
    handleTimeScaleChange(next)
    if (timeScaleSliderRef.current) {
      timeScaleSliderRef.current.value = actualToSlider(next).toString()
    }
  }, [timeSystem.timeScale, handleTimeScaleChange])

  const btnBase = "rounded-lg bg-gray-800/80 hover:bg-gray-700/80 text-gray-200 transition-colors flex items-center justify-center"
  const btnSmall = `${btnBase} p-1.5 min-w-[36px] min-h-[36px]`
  const btnSmActive = (active: boolean) => `${btnSmall} ${active ? 'bg-blue-600/70 ring-1 ring-blue-400' : ''}`

  const planets = celestialBodies.filter((b) =>
    b.type === 'planet' || b.type === 'moon'
  )

  // ─── 移动端横屏布局：Canvas 全高 + 右侧控制面板 ───
  if (isMobileLandscape) {
    return (
      <div className="absolute top-0 right-0 bottom-0 z-30 w-[200px] bg-gray-900/90 backdrop-blur-sm border-l border-gray-700/50 flex flex-col slim-scrollbar overflow-y-auto safe-top safe-bottom">
        {/* 时间控制 */}
        <div className="px-2 py-2 border-b border-gray-700/30 space-y-2">
          <div className="flex items-center justify-between">
            <button onClick={handleTogglePause} className={`touch-btn p-1.5 rounded-lg transition-colors ${!timeSystem.isPaused ? 'bg-blue-600/60 text-white' : 'bg-gray-700/50 text-gray-300'}`}>
              {timeSystem.isPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button onClick={resetTimeScale} className="text-[9px] text-gray-500 hover:text-gray-300 px-1 py-0.5 rounded bg-gray-700/30">
              10×
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => changeSpeed(-1)} className="touch-btn p-1 rounded bg-gray-700/50 text-gray-300 hover:bg-gray-600">
              <Rewind size={12} />
            </button>
            <input
              ref={timeScaleSliderRef}
              type="range"
              min="0.1" max="10000" step="0.1"
              defaultValue={actualToSlider(timeSystem.timeScale)}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="flex-1 h-6 accent-blue-400"
            />
            <button onClick={() => changeSpeed(1)} className="touch-btn p-1 rounded bg-gray-700/50 text-gray-300 hover:bg-gray-600">
              <FastForward size={12} />
            </button>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleInputCommit()}
            className="w-full text-center text-[11px] bg-gray-800/50 border border-gray-600/40 rounded px-1 py-0.5 text-gray-200 font-mono focus:outline-none focus:border-blue-400"
            placeholder="0.1-10000"
          />
        </div>

        {/* 视图控制 */}
        <div className="px-2 py-2 border-b border-gray-700/30">
          <div className="text-[10px] text-gray-500 mb-1.5">视图</div>
          <div className="grid grid-cols-3 gap-1">
            <button onClick={() => setDistanceScale(Math.max(0.5, distanceScale - 1))}
              className="touch-btn py-1.5 rounded bg-gray-700/40 text-gray-300 text-[10px] hover:bg-gray-600/50 flex items-center justify-center gap-0.5">
              <Minimize2 size={11} />−
            </button>
            <button onClick={() => { setFocusBody(null); selectBody(null) }}
              className="touch-btn py-1.5 rounded bg-gray-700/40 text-gray-300 text-[10px] hover:bg-gray-600/50">
              全景
            </button>
            <button onClick={() => setDistanceScale(Math.min(20, distanceScale + 1))}
              className="touch-btn py-1.5 rounded bg-gray-700/40 text-gray-300 text-[10px] hover:bg-gray-600/50 flex items-center justify-center gap-0.5">
              <Maximize2 size={11} />+
            </button>
          </div>
        </div>

        {/* 显示选项 */}
        <div className="px-2 py-2 border-b border-gray-700/30">
          <div className="text-[10px] text-gray-500 mb-1.5">显示</div>
          <div className="grid grid-cols-3 gap-1">
            <button onClick={toggleOrbits} className={`touch-btn py-1.5 rounded text-[10px] transition-colors flex items-center justify-center gap-0.5 ${showOrbits ? 'bg-blue-600/60 text-white' : 'bg-gray-700/40 text-gray-300'}`}>
              <CircleOff size={11} /><span className="text-[9px]">轨道</span>
            </button>
            <button onClick={() => setShowAtmosphere(!showAtmosphere)} className={`touch-btn py-1.5 rounded text-[10px] transition-colors flex items-center justify-center gap-0.5 ${showAtmosphere ? 'bg-cyan-600/60 text-white' : 'bg-gray-700/40 text-gray-300'}`}>
              <Gauge size={11} /><span className="text-[9px]">大气</span>
            </button>
            <button onClick={() => setShowRings(!showRings)} className={`touch-btn py-1.5 rounded text-[10px] transition-colors flex items-center justify-center gap-0.5 ${showRings ? 'bg-amber-600/60 text-white' : 'bg-gray-700/40 text-gray-300'}`}>
              <Globe size={11} /><span className="text-[9px]">环</span>
            </button>
          </div>
        </div>

        {/* 天体列表 */}
        <div className="flex-1 overflow-y-auto slim-scrollbar px-2 py-2">
          <div className="text-[10px] text-gray-500 mb-1.5">天体</div>
          <div className="space-y-1">
            {planets.map((planet) => (
              <button
                key={planet.id}
                onClick={() => handlePlanetClick(planet)}
                className={`touch-btn w-full py-1.5 px-2 rounded text-[10px] text-left transition-all
                  ${selectedBody?.id === planet.id
                    ? 'bg-blue-600/70 text-white'
                    : 'bg-gray-700/30 text-gray-300 hover:bg-gray-600/40'}`}
              >
                {planet.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── 移动端竖屏布局 ───
  if (isMobilePortrait) {
    return (
      <div className={`
        relative bg-gray-900/95 border-t border-gray-700/50 safe-bottom
        transition-all duration-300 ease-in-out
        ${mobileExpanded ? 'flex-[1]' : 'h-[10vh]'}
      `}>
        {/* 顶栏：播放 + 流速滑块 + 展开 */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/30">
          <button onClick={handleTogglePause} className={`touch-btn p-2 rounded-lg transition-colors ${!timeSystem.isPaused ? 'bg-blue-600/60 text-white' : 'bg-gray-700/50 text-gray-300'}`}>
            {timeSystem.isPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button onClick={() => changeSpeed(-1)} className="touch-btn p-1.5 rounded bg-gray-700/40 text-gray-300 hover:bg-gray-600/50">
              <Rewind size={13} />
            </button>
            <input
              ref={timeScaleSliderRef}
              type="range"
              min="0.1" max="10000" step="0.1"
              defaultValue={actualToSlider(timeSystem.timeScale)}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="flex-1 h-7 accent-blue-400"
              style={{ touchAction: 'none' }}
            />
            <button onClick={() => changeSpeed(1)} className="touch-btn p-1.5 rounded bg-gray-700/40 text-gray-300 hover:bg-gray-600/50">
              <FastForward size={13} />
            </button>
            <button onClick={resetTimeScale} className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded bg-gray-700/30 shrink-0">
              10×
            </button>
          </div>

          <button onClick={() => setMobileExpanded(!mobileExpanded)}
            className={`touch-btn p-2 rounded-lg transition-all duration-200 ${mobileExpanded ? 'bg-blue-600/50 rotate-180' : 'bg-gray-700/40'}`}>
            <ChevronUp size={16} />
          </button>
        </div>

        {/* 展开面板 */}
        <div className={`
          overflow-y-auto slim-scrollbar transition-all duration-300 ease-in-out
          ${mobileExpanded ? 'max-h-[62vh] opacity-100 py-1' : 'max-h-0 opacity-0 py-0'}
        `} style={{ pointerEvents: mobileExpanded ? 'auto' : 'none' }}>
          
          {/* 手动输入 */}
          <div className="px-3 py-1">
            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputCommit}
              onKeyDown={(e) => e.key === 'Enter' && handleInputCommit()}
              className="w-full text-center text-xs bg-gray-800/50 border border-gray-600/40 rounded px-2 py-1 text-gray-200 font-mono focus:outline-none focus:border-blue-400"
              placeholder="输入 0.1-10000"
            />
          </div>

          {/* 天体列表 */}
          <div className="px-3 py-1.5">
            <div className="text-[10px] text-gray-500 mb-1.5">天体</div>
            <div className="flex flex-wrap gap-1.5">
              {planets.map((planet) => (
                <button
                  key={planet.id}
                  onClick={() => handlePlanetClick(planet)}
                  className={`
                    touch-btn py-2.5 px-2.5 rounded-full text-[11px] leading-tight transition-all min-h-[36px] flex items-center
                    ${selectedBody?.id === planet.id
                      ? 'bg-blue-600/80 text-white ring-1 ring-blue-400'
                      : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'}
                  `}
                >
                  {planet.name}
                </button>
              ))}
              <button onClick={() => { selectBody(null); setFocusBody(null) }}
                className="touch-btn py-2.5 px-2.5 rounded-full text-[11px] bg-gray-700/30 text-gray-400 hover:bg-gray-600/50 transition-all min-h-[36px] flex items-center">
                全景
              </button>
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="px-3 py-1.5 border-t border-gray-700/30">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-gray-500">缩放</span>
                <button onClick={() => setDistanceScale(Math.max(0.5, distanceScale - 1))}
                  className="touch-btn px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">
                  <Minimize2 size={11} />
                </button>
                <button onClick={() => setDistanceScale(Math.min(20, distanceScale + 1))}
                  className="touch-btn px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">
                  <Maximize2 size={11} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={toggleOrbits} className={`touch-btn p-1.5 rounded transition-colors flex items-center gap-0.5 ${showOrbits ? 'bg-blue-600/60 text-white' : 'bg-gray-800/50 text-gray-400'}`}>
                  <CircleOff size={12} /><span className="text-[10px]">轨道</span>
                </button>
                <button onClick={() => setShowAtmosphere(!showAtmosphere)} className={`touch-btn p-1.5 rounded transition-colors flex items-center gap-0.5 ${showAtmosphere ? 'bg-cyan-600/60 text-white' : 'bg-gray-800/50 text-gray-400'}`}>
                  <Gauge size={12} /><span className="text-[10px]">大气</span>
                </button>
                <button onClick={() => setShowRings(!showRings)} className={`touch-btn p-1.5 rounded transition-colors flex items-center gap-0.5 ${showRings ? 'bg-amber-600/60 text-white' : 'bg-gray-800/50 text-gray-400'}`}>
                  <Globe size={12} /><span className="text-[10px]">环</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── 桌面端布局 ───
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30">
      <div className="bg-gray-900/85 backdrop-blur-sm border-t border-gray-700/50 px-3 py-2">
        <div className="flex items-center gap-3 max-w-screen-xl mx-auto">
          <button onClick={handleTogglePause}
            className={`p-1.5 rounded-lg transition-colors ${timeSystem.isPaused ? 'bg-blue-600/60 hover:bg-blue-600/80 text-white' : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'}`}>
            {timeSystem.isPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>

          <button onClick={() => changeSpeed(-1)}
            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 transition-colors">
            <Rewind size={14} />
          </button>

          <div className="flex items-center gap-2 flex-1 max-w-[400px]">
            <span className="text-xs text-gray-400 font-mono w-14 text-right tabular-nums">
              {actualToDisplay(timeSystem.timeScale)}×
            </span>
            <input
              ref={timeScaleSliderRef}
              type="range"
              min="0.1" max="10000" step="0.1"
              defaultValue={actualToSlider(timeSystem.timeScale)}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-blue-400 cursor-pointer"
            />
            <button onClick={resetTimeScale}
              className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded bg-gray-700/30 hover:bg-gray-600/50 transition-colors">
              10×
            </button>
          </div>

          <button onClick={() => changeSpeed(1)}
            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 transition-colors">
            <FastForward size={14} />
          </button>

          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputCommit}
              onKeyDown={(e) => e.key === 'Enter' && handleInputCommit()}
              className="w-16 text-center text-xs bg-gray-800/50 border border-gray-600/40 rounded px-1.5 py-0.5 text-gray-200 font-mono focus:outline-none focus:border-blue-400"
              placeholder="值"
            />
          </div>

          <div className="w-px h-5 bg-gray-600/40" />

          <button onClick={() => setDistanceScale(Math.max(0.5, distanceScale - 1))}
            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 transition-colors" title="缩小">
            <Minimize2 size={14} />
          </button>
          <button onClick={() => setDistanceScale(Math.min(20, distanceScale + 1))}
            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 transition-colors" title="放大">
            <Maximize2 size={14} />
          </button>

          <div className="w-px h-5 bg-gray-600/40" />

          <button onClick={toggleOrbits}
            className={`p-1.5 rounded-lg transition-colors ${showOrbits ? 'bg-blue-600/60 hover:bg-blue-600/80 text-white' : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'}`}
            title="轨道显示">
            <CircleOff size={14} />
          </button>
          <button onClick={() => setShowNebula(!showNebula)}
            className={`p-1.5 rounded-lg transition-colors ${showNebula ? 'bg-purple-600/60 hover:bg-purple-600/80 text-white' : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'}`}
            title="星云">
            <Settings size={14} />
          </button>
          <button onClick={() => setShowAtmosphere(!showAtmosphere)}
            className={`p-1.5 rounded-lg transition-colors ${showAtmosphere ? 'bg-cyan-600/60 hover:bg-cyan-600/80 text-white' : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'}`}
            title="大气层">
            <Gauge size={14} />
          </button>
          <button onClick={() => setShowRings(!showRings)}
            className={`p-1.5 rounded-lg transition-colors ${showRings ? 'bg-amber-600/60 hover:bg-amber-600/80 text-white' : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'}`}
            title="行星环">
            <Globe size={14} />
          </button>
          <button onClick={() => setShowDustCloud(!showDustCloud)}
            className={`p-1.5 rounded-lg transition-colors ${showDustCloud ? 'bg-rose-600/60 hover:bg-rose-600/80 text-white' : 'bg-gray-700/50 hover:bg-gray-600/70 text-gray-300'}`}
            title="尘埃云">
            <CircleOff size={14} />
          </button>
        </div>
      </div>

      <div className="bg-gray-900/70 backdrop-blur-sm border-t border-gray-700/30 px-3 py-2.5">
        <div className="flex items-center gap-2 overflow-x-auto max-w-screen-xl mx-auto slim-scrollbar touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          <span className="text-[10px] text-gray-500 shrink-0 mr-1">天体:</span>
          {planets.map((planet) => (
            <button
              key={planet.id}
              onClick={() => handlePlanetClick(planet)}
              className={`
                px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all shrink-0
                ${selectedBody?.id === planet.id
                  ? 'bg-blue-600/80 text-white ring-1 ring-blue-400'
                  : 'bg-gray-700/40 text-gray-300 hover:bg-gray-600/60'}
              `}
            >
              {planet.name}
            </button>
          ))}
          <button
            onClick={() => { selectBody(null); setFocusBody(null) }}
            className="px-2.5 py-1 rounded-full text-xs bg-gray-700/30 text-gray-400 hover:bg-gray-600/50 transition-all shrink-0">
            全景
          </button>
        </div>
      </div>
    </div>
  )
}
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
}

export default function ControlPanel({ isMobilePortrait }: ControlPanelProps) {
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
  const [showFocusPanel, setShowFocusPanel] = useState(false)
  const [showVisualPanel, setShowVisualPanel] = useState(false)

  const timeScaleSliderRef = useRef<HTMLInputElement>(null)

  const handleTogglePause = useCallback(() => {
    updateTimeSystem({ isPaused: !timeSystem.isPaused })
  }, [timeSystem.isPaused, updateTimeSystem])

  const handleTimeScaleChange = useCallback((value: number) => {
    updateTimeSystem({ timeScale: value })
  }, [updateTimeSystem])

  const resetTimeScale = useCallback(() => {
    handleTimeScaleChange(1.0)
    if (timeScaleSliderRef.current) {
      timeScaleSliderRef.current.value = '1'
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

  const changeSpeed = useCallback((delta: number) => {
    const current = timeSystem.timeScale
    const next = current + delta
    handleTimeScaleChange(Math.max(0.1, Math.min(100, Math.round(next * 10) / 10)))
  }, [timeSystem.timeScale, handleTimeScaleChange])

  const btnBase = "rounded-lg bg-gray-800/80 hover:bg-gray-700/80 text-gray-200 transition-colors flex items-center justify-center"
  const btnSmall = `${btnBase} p-1.5 min-w-[36px] min-h-[36px]`
  const btnSmActive = (active: boolean) => `${btnSmall} ${active ? 'bg-blue-600/70 ring-1 ring-blue-400' : ''}`

  const planets = celestialBodies.filter((b) =>
    b.type === 'planet' || b.type === 'moon'
  )

  // ─── 移动端竖屏布局 ───
  if (isMobilePortrait) {
    return (
      <div className={`
        relative bg-gray-900/95 border-t border-gray-700/50 safe-bottom
        transition-all duration-300 ease-in-out
        ${mobileExpanded ? 'flex-1' : 'h-[14vh]'}
      `}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/30">
          <div className="flex items-center gap-2">
            <button onClick={handleTogglePause} className={btnSmActive(!timeSystem.isPaused)}>
              {timeSystem.isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button onClick={() => changeSpeed(-1)} className={btnSmall}>
              <Rewind size={14} />
            </button>
            <button onClick={() => changeSpeed(1)} className={btnSmall}>
              <FastForward size={14} />
            </button>
            <span className="text-xs text-gray-400 font-mono ml-1">
              {timeSystem.timeScale.toFixed(1)}×
            </span>
          </div>

          <div className="text-xs text-gray-300 truncate max-w-[30vw]">
            {selectedBody ? `🔭 ${selectedBody.name}` : '浏览模式'}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => setShowFocusPanel(!showFocusPanel)}
              className={btnSmActive(showFocusPanel)}>
              <Globe size={15} />
            </button>
            <button onClick={() => setShowVisualPanel(!showVisualPanel)}
              className={btnSmActive(showVisualPanel)}>
              <Eye size={15} />
            </button>
            <button onClick={() => setMobileExpanded(!mobileExpanded)}
              className={`${btnSmall} ${mobileExpanded ? 'bg-blue-600/50' : ''}`}>
              <ChevronUp size={16}
                style={{ transform: mobileExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}
              />
            </button>
          </div>
        </div>

        <div className="px-3 py-1.5 flex items-center gap-2">
          <span className="text-[10px] text-gray-500 shrink-0">流速</span>
          <input
            ref={timeScaleSliderRef}
            type="range"
            min="0.1"
            max="100"
            step="0.1"
            defaultValue={timeSystem.timeScale}
            onChange={(e) => handleTimeScaleChange(parseFloat(e.target.value))}
            className="flex-1 h-8 accent-blue-400"
            style={{ touchAction: 'none' }}
          />
          <button onClick={resetTimeScale} className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700">
            1×
          </button>
        </div>

        <div className={`overflow-y-auto transition-all duration-300 ${mobileExpanded ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0'}`}
          style={{ pointerEvents: mobileExpanded ? 'auto' : 'none' }}>
          
          <div className="px-3 py-2">
            <div className="text-[11px] text-gray-500 mb-1.5">天体聚焦</div>
            <div className="grid grid-cols-4 gap-1.5">
              {planets.map((planet) => (
                <button
                  key={planet.id}
                  onClick={() => handlePlanetClick(planet)}
                  className={`
                    py-1.5 px-1 rounded-lg text-[11px] leading-tight text-center transition-all
                    ${selectedBody?.id === planet.id
                      ? 'bg-blue-600/80 text-white ring-1 ring-blue-400'
                      : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'}
                  `}
                >
                  {planet.name}
                </button>
              ))}
            </div>
          </div>

          {showFocusPanel && (
            <div className="px-3 py-2 border-t border-gray-700/30">
              <div className="text-[11px] text-gray-400 mb-1.5">视图控制</div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => { setFocusBody(selectedBody!); setShowFocusPanel(false) }}
                  className="px-2 py-1 rounded text-[11px] bg-gray-800 text-gray-300 hover:bg-gray-700">
                  聚焦选中
                </button>
                <button onClick={() => { setFocusBody(null); selectBody(null); setShowFocusPanel(false) }}
                  className="px-2 py-1 rounded text-[11px] bg-gray-800 text-gray-300 hover:bg-gray-700">
                  全景视图
                </button>
                <button onClick={() => setDistanceScale(Math.max(0.5, distanceScale - 1))}
                  className="px-2 py-1 rounded text-[11px] bg-gray-800 text-gray-300 hover:bg-gray-700">
                  <Minimize2 size={12} className="inline mr-1" />缩小
                </button>
                <button onClick={() => setDistanceScale(Math.min(20, distanceScale + 1))}
                  className="px-2 py-1 rounded text-[11px] bg-gray-800 text-gray-300 hover:bg-gray-700">
                  <Maximize2 size={12} className="inline mr-1" />放大
                </button>
              </div>
            </div>
          )}

          {showVisualPanel && (
            <div className="px-3 py-2 border-t border-gray-700/30">
              <div className="text-[11px] text-gray-400 mb-1.5">显示选项</div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={toggleOrbits} className={btnSmActive(showOrbits)}>
                  <CircleOff size={13} />
                </button>
                <button onClick={() => setShowNebula(!showNebula)} className={btnSmActive(showNebula)}>
                  <Settings size={13} />
                </button>
                <button onClick={() => setShowAtmosphere(!showAtmosphere)} className={btnSmActive(showAtmosphere)}>
                  <Gauge size={13} />
                </button>
                <button onClick={() => setShowRings(!showRings)} className={btnSmActive(showRings)}>
                  <Globe size={13} />
                </button>
                <button onClick={() => setShowDustCloud(!showDustCloud)} className={btnSmActive(showDustCloud)}>
                  <CircleOff size={13} />
                </button>
              </div>
            </div>
          )}
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

          <div className="flex items-center gap-2 flex-1 max-w-[300px]">
            <span className="text-xs text-gray-400 font-mono w-12 text-right tabular-nums">
              {timeSystem.timeScale.toFixed(1)}×
            </span>
            <input
              ref={timeScaleSliderRef}
              type="range"
              min="0.1"
              max="100"
              step="0.1"
              defaultValue={timeSystem.timeScale}
              onChange={(e) => handleTimeScaleChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-blue-400 cursor-pointer"
            />
            <button onClick={resetTimeScale}
              className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded bg-gray-700/30 hover:bg-gray-600/50 transition-colors">
              1×
            </button>
          </div>

          <button onClick={() => changeSpeed(1)}
            className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 transition-colors">
            <FastForward size={14} />
          </button>

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

      <div className="bg-gray-900/70 backdrop-blur-sm border-t border-gray-700/30 px-3 py-1.5">
        <div className="flex items-center gap-2 overflow-x-auto max-w-screen-xl mx-auto scrollbar-thin">
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
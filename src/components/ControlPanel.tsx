import { useState } from 'react'
import { Play, Pause, FastForward, Rewind, Eye, EyeOff, Sun, Crosshair, Monitor, Palette, Sparkles, Settings2, Maximize2, MoveVertical, Zap, Lightbulb, Star, Layers, Circle, Cloud, Moon } from 'lucide-react'
import { useStore } from '../store'

function ControlPanel() {
  const { 
    timeSystem, showOrbits, focusBody, brightness, 
    backgroundBrightness, backgroundColor, showNebula,
    distanceScale, sizeScale, lightIntensity, ambientLight, starGlow,
    showAtmosphere, showRings, showAsteroids, showDustCloud, showShadows,
    celestialBodies,
    updateTimeSystem, toggleOrbits, setFocusBody, 
    setBrightness, setBackgroundBrightness, setBackgroundColor, setShowNebula,
    setDistanceScale, setSizeScale, setLightIntensity, setAmbientLight, setStarGlow,
    setShowAtmosphere, setShowRings, setShowAsteroids, setShowDustCloud, setShowShadows
  } = useStore()

  const [expanded, setExpanded] = useState(false)
  const [visualExpanded, setVisualExpanded] = useState(false)

  const presets = [
    { name: '深空', color: '#0a0a1a' },
    { name: '深蓝', color: '#0f172a' },
  ]

  const adjustTimeScale = (delta: number) => {
    updateTimeSystem({ timeScale: Math.max(0.1, Math.min(100, timeSystem.timeScale + delta)) })
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
      {expanded && (
        <div className="mb-2 bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-3 min-w-0 w-[400px] max-md:w-[calc(100vw-1rem)] max-md:p-2">
          <div className="grid grid-cols-2 gap-3 max-md:gap-1.5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Maximize2 size={12} />
                <span>距离缩放</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={distanceScale}
                onChange={(e) => setDistanceScale(parseFloat(e.target.value))}
                className="w-full accent-blue-500 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{distanceScale.toFixed(1)}x</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <MoveVertical size={12} />
                <span>大小缩放</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={sizeScale}
                onChange={(e) => setSizeScale(parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{sizeScale.toFixed(1)}x</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Sun size={12} />
                <span>场景亮度</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={brightness}
                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                className="w-full accent-yellow-500 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{brightness.toFixed(1)}x</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Monitor size={12} />
                <span>背景亮度</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={backgroundBrightness}
                onChange={(e) => setBackgroundBrightness(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{(backgroundBrightness * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      )}

      {visualExpanded && (
        <div className="mb-2 bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-3 min-w-0 w-[400px] max-md:w-[calc(100vw-1rem)] max-md:p-2">
          <div className="grid grid-cols-2 gap-3 max-md:gap-1.5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Zap size={12} />
                <span>光照强度</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={lightIntensity}
                onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
                className="w-full accent-orange-500 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{lightIntensity.toFixed(1)}x</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Lightbulb size={12} />
                <span>环境光</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ambientLight}
                onChange={(e) => setAmbientLight(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{(ambientLight * 100).toFixed(0)}%</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Star size={12} />
                <span>恒星光晕</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={starGlow}
                onChange={(e) => setStarGlow(parseFloat(e.target.value))}
                className="w-full accent-yellow-400 h-1.5"
              />
              <div className="text-xs text-gray-500 text-right">{starGlow.toFixed(1)}x</div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-400 mb-2">显示选项</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowAtmosphere(!showAtmosphere)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${showAtmosphere ? 'bg-blue-600/30 text-blue-300' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'}`}
              >
                <Cloud size={14} />
                <span>大气层</span>
              </button>
              <button
                onClick={() => setShowRings(!showRings)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${showRings ? 'bg-purple-600/30 text-purple-300' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'}`}
              >
                <Circle size={14} />
                <span>行星环</span>
              </button>
              <button
                onClick={() => setShowAsteroids(!showAsteroids)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${showAsteroids ? 'bg-gray-600/30 text-gray-300' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'}`}
              >
                <Layers size={14} />
                <span>小行星带</span>
              </button>
              <button
                onClick={() => setShowDustCloud(!showDustCloud)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${showDustCloud ? 'bg-cyan-600/30 text-cyan-300' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'}`}
              >
                <Cloud size={14} />
                <span>尘埃云</span>
              </button>
              <button
                onClick={() => setShowShadows(!showShadows)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${showShadows ? 'bg-gray-600/30 text-gray-300' : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'}`}
              >
                <Moon size={14} />
                <span>阴影</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-2 flex items-center gap-2 max-md:gap-1 max-md:px-1 max-md:py-1">
        <button
          onClick={() => updateTimeSystem({ isPaused: !timeSystem.isPaused })}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
          title={timeSystem.isPaused ? '播放' : '暂停'}
        >
          {timeSystem.isPaused ? <Play size={18} /> : <Pause size={18} />}
        </button>

        <button
          onClick={() => adjustTimeScale(-0.5)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
          title="减速"
        >
          <Rewind size={18} />
        </button>

        <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg px-2 py-1 max-md:w-12">
          <input
            type="range"
            min="0.1"
            max="100"
            step="0.1"
            value={timeSystem.timeScale}
            onChange={(e) => updateTimeSystem({ timeScale: parseFloat(e.target.value) })}
            className="w-16 max-md:w-10 accent-blue-500 h-1.5"
          />
          <span className="text-white text-xs w-8">{timeSystem.timeScale.toFixed(1)}x</span>
        </div>

        <button
          onClick={() => adjustTimeScale(0.5)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
          title="加速"
        >
          <FastForward size={18} />
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        <button
          onClick={toggleOrbits}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-white"
          title={showOrbits ? '隐藏轨道' : '显示轨道'}
        >
          {showOrbits ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>

        <button
          onClick={() => setShowNebula(!showNebula)}
          className={`p-2 rounded-lg transition-colors text-white ${showNebula ? 'bg-purple-600/30 text-purple-300' : 'hover:bg-gray-700'}`}
          title={showNebula ? '隐藏星云' : '显示星云'}
        >
          <Sparkles size={18} />
        </button>

        <div className="w-px h-6 bg-gray-700 mx-1 max-md:hidden" />

        <select
          value={focusBody?.id || ''}
          onChange={(e) => {
            const body = celestialBodies.find(b => b.id === e.target.value)
            setFocusBody(body || null)
          }}
          className="bg-gray-800/50 text-white px-2 py-1 rounded-lg text-xs border border-gray-700 focus:border-blue-500 focus:outline-none min-w-[100px] max-md:hidden"
        >
          <option value="">全景</option>
          {celestialBodies.map(body => (
            <option key={body.id} value={body.id}>{body.name}</option>
          ))}
        </select>

        <div className="w-px h-6 bg-gray-700 mx-1 max-md:hidden" />

        <div className="flex gap-1 max-md:hidden">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setBackgroundColor(preset.color)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                backgroundColor === preset.color ? 'border-white scale-110' : 'border-gray-600 hover:scale-105'
              }`}
              style={{ backgroundColor: preset.color }}
              title={preset.name}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        <button
          onClick={() => setExpanded(!expanded)}
          className={`p-2 rounded-lg transition-colors text-white ${expanded ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-gray-700'}`}
          title="缩放设置"
        >
          <Settings2 size={18} />
        </button>

        <button
          onClick={() => setVisualExpanded(!visualExpanded)}
          className={`p-2 rounded-lg transition-colors text-white ${visualExpanded ? 'bg-purple-600/30 text-purple-300' : 'hover:bg-gray-700'}`}
          title="视觉效果"
        >
          <Palette size={18} />
        </button>
      </div>
    </div>
  )
}

export default ControlPanel

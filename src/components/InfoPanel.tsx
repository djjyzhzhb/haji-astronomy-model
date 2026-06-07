import { useState } from 'react'
import { X, Globe, Sun, Moon, Scale, Thermometer, Crosshair, Circle, Compass, Edit2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useStore } from '../store'
import { calculateOrbitalPeriod } from '../utils/keplerOrbit'

function InfoPanel() {
  const { selectedBody, selectBody, focusBody, setFocusBody, updateCelestialBody, setCurrentPage, setSelectedPlanetId } = useStore()
  const [isEditing, setIsEditing] = useState(false)
  const [showOrbitParams, setShowOrbitParams] = useState(false)
  const [editableBody, setEditableBody] = useState(selectedBody ? { ...selectedBody } : null)

  if (!selectedBody) return null

  // 判断是否为宜居行星
  const isHabitablePlanet = selectedBody.id === 'planet-1' && selectedBody.type === 'planet'

  const getIcon = () => {
    switch (selectedBody.type) {
      case 'star': return <Sun className="text-yellow-400" size={24} />
      case 'planet': return <Globe className="text-blue-400" size={24} />
      case 'moon': return <Moon className="text-gray-400" size={24} />
      default: return <Globe size={24} />
    }
  }

  const getTypeLabel = () => {
    switch (selectedBody.type) {
      case 'star': return '恒星'
      case 'planet': return '行星'
      case 'moon': return '卫星'
      default: return '天体'
    }
  }

  const isFocused = focusBody?.id === selectedBody.id

  const handleSave = () => {
    if (editableBody) {
      updateCelestialBody(editableBody.id, editableBody)
      setIsEditing(false)
    }
  }

  const handleCancel = () => {
    setEditableBody(selectedBody ? { ...selectedBody } : null)
    setIsEditing(false)
  }

  const startEdit = () => {
    setEditableBody(selectedBody ? { ...selectedBody } : null)
    setIsEditing(true)
  }

  const body = isEditing && editableBody ? editableBody : selectedBody

  return (
    <div className="w-80 bg-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-gray-700/50 sticky top-0 bg-gray-900/95 z-10">
        <div className="flex items-center gap-3">
          {getIcon()}
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editableBody?.name || ''}
                onChange={(e) => setEditableBody({ ...editableBody!, name: e.target.value })}
                className="bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              />
            ) : (
              <h2 className="text-white font-bold text-lg">{selectedBody.name}</h2>
            )}
            <span className="text-gray-400 text-sm">{getTypeLabel()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={isEditing ? handleCancel : startEdit}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            title={isEditing ? '取消编辑' : '编辑天体'}
          >
            {isEditing ? <X size={18} /> : <Edit2 size={18} />}
          </button>
          {!isEditing && (
            <button
              onClick={() => selectBody(null)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="关闭面板"
            >
              <X size={18} />
            </button>
          )}
          {isEditing && (
            <button
              onClick={handleSave}
              className="p-2 hover:bg-green-700 rounded-lg transition-colors text-green-400 hover:text-white"
              title="保存修改"
            >
              <Check size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-gray-400 text-sm">描述</label>
              <textarea
                value={editableBody?.description || ''}
                onChange={(e) => setEditableBody({ ...editableBody!, description: e.target.value })}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
                rows={3}
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm">半径</label>
              <input
                type="number"
                step="0.1"
                value={editableBody?.radius || 0}
                onChange={(e) => setEditableBody({ ...editableBody!, radius: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm">颜色</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={editableBody?.color || '#ffffff'}
                  onChange={(e) => setEditableBody({ ...editableBody!, color: e.target.value })}
                  className="w-12 h-10 rounded border-0 cursor-pointer"
                />
                <span className="text-gray-400 text-sm">{editableBody?.color}</span>
              </div>
            </div>

            {body.type !== 'star' && (
              <>
                <div>
                  <label className="text-gray-400 text-sm">自转速度</label>
                  <input
                    type="number"
                    step="0.001"
                    value={editableBody?.rotationSpeed || 0}
                    onChange={(e) => setEditableBody({ ...editableBody!, rotationSpeed: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
                  />
                </div>

                <div>
                  <label className="text-gray-400 text-sm">轴向倾斜 (度)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="180"
                    value={((editableBody?.axialTilt || 0) * 180 / Math.PI).toFixed(0)}
                    onChange={(e) => setEditableBody({ ...editableBody!, axialTilt: parseFloat(e.target.value) * Math.PI / 180 })}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
                  />
                </div>

                {body.hasRing !== undefined && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hasRing"
                      checked={editableBody?.hasRing || false}
                      onChange={(e) => setEditableBody({ ...editableBody!, hasRing: e.target.checked })}
                      className="w-4 h-4 text-blue-500 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="hasRing" className="text-gray-400 text-sm">有行星环</label>
                  </div>
                )}

                {editableBody?.hasRing && (
                  <div>
                    <label className="text-gray-400 text-sm">行星环颜色</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={editableBody?.ringColor || '#ffffff'}
                        onChange={(e) => setEditableBody({ ...editableBody!, ringColor: e.target.value })}
                        className="w-12 h-10 rounded border-0 cursor-pointer"
                      />
                      <span className="text-gray-400 text-sm">{editableBody?.ringColor}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {body.orbitalElements && (
              <div>
                <button
                  onClick={() => setShowOrbitParams(!showOrbitParams)}
                  className="flex items-center gap-2 text-gray-400 text-sm mb-2 hover:text-white"
                >
                  {showOrbitParams ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  轨道参数
                </button>
                {showOrbitParams && (
                  <div className="space-y-3 pl-4 border-l border-gray-700">
                    <div>
                      <label className="text-gray-400 text-sm">半长轴</label>
                      <input
                        type="number"
                        step="1"
                        value={editableBody?.orbitalElements?.semiMajorAxis || 0}
                        onChange={(e) => setEditableBody({
                          ...editableBody!,
                          orbitalElements: {
                            ...editableBody!.orbitalElements!,
                            semiMajorAxis: parseFloat(e.target.value) || 0
                          }
                        })}
                        className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-gray-400 text-sm">离心率</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="0.9"
                        value={editableBody?.orbitalElements?.eccentricity || 0}
                        onChange={(e) => setEditableBody({
                          ...editableBody!,
                          orbitalElements: {
                            ...editableBody!.orbitalElements!,
                            eccentricity: parseFloat(e.target.value) || 0
                          }
                        })}
                        className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-gray-400 text-sm">倾角 (度)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="45"
                        value={((editableBody?.orbitalElements?.inclination || 0) * 180 / Math.PI).toFixed(0)}
                        onChange={(e) => setEditableBody({
                          ...editableBody!,
                          orbitalElements: {
                            ...editableBody!.orbitalElements!,
                            inclination: parseFloat(e.target.value) * Math.PI / 180
                          }
                        })}
                        className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-gray-300 text-sm leading-relaxed">
              {selectedBody.description}
            </div>

            <button
              onClick={() => {
                if (isFocused) {
                  setFocusBody(null)
                } else {
                  setFocusBody(selectedBody)
                }
              }}
              className={`w-full py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 ${
                isFocused
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              <Crosshair size={16} />
              {isFocused ? '取消聚焦' : '聚焦此天体'}
            </button>

            {isHabitablePlanet && (
              <button
                onClick={() => {
                  setSelectedPlanetId(selectedBody.id)
                  setCurrentPage('detail')
                }}
                className="w-full py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Globe size={16} />
                进入行星细节
              </button>
            )}

            <div className="space-y-3">
              {selectedBody.mass && (
                <div className="flex items-center gap-3 text-sm">
                  <Scale size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-400">质量</span>
                  <span className="text-white ml-auto">{selectedBody.mass}</span>
                </div>
              )}

              {selectedBody.diameter && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-400">直径</span>
                  <span className="text-white ml-auto">{selectedBody.diameter}</span>
                </div>
              )}

              {selectedBody.temperature && (
                <div className="flex items-center gap-3 text-sm">
                  <Thermometer size={16} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-400">温度</span>
                  <span className="text-white ml-auto">{selectedBody.temperature}</span>
                </div>
              )}

              {selectedBody.axialTilt !== undefined && (
                <div className="flex items-center gap-3 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 flex-shrink-0">
                    <path d="M21 12a9 9 0 1 1-9-9c.2 0 .4 0 .6.01" />
                    <path d="M3.6 9h16.8" />
                    <path d="M3.6 15h16.8" />
                    <path d="M11.5 3a17 17 0 0 0 0 18" />
                    <path d="M12.5 3a17 17 0 0 1 0 18" />
                  </svg>
                  <span className="text-gray-400">轴向倾斜</span>
                  <span className="text-white ml-auto">{Math.round((selectedBody.axialTilt * 180) / Math.PI)}°</span>
                </div>
              )}

              {selectedBody.orbitalElements && (
                <>
                  <div className="pt-2 border-t border-gray-700/50 mt-2">
                    <div className="text-gray-500 text-xs font-medium uppercase mb-2">轨道参数</div>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Circle size={16} className="text-gray-500 flex-shrink-0" />
                    <span className="text-gray-400">半长轴</span>
                    <span className="text-white ml-auto">{selectedBody.orbitalElements.semiMajorAxis.toFixed(1)}</span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 flex-shrink-0">
                      <path d="M12 22c4.97 0 9-4.03 9-9-4.97 0-9 4.03-9 9z" />
                      <path d="M12 2C7.03 2 2 6.03 2 11c4.97 0 9-4.03 9-9z" />
                    </svg>
                    <span className="text-gray-400">离心率</span>
                    <span className="text-white ml-auto">{selectedBody.orbitalElements.eccentricity.toFixed(3)}</span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Compass size={16} className="text-gray-500 flex-shrink-0" />
                    <span className="text-gray-400">轨道周期</span>
                    <span className="text-white ml-auto">{calculateOrbitalPeriod(selectedBody.orbitalElements.semiMajorAxis).toFixed(1)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default InfoPanel

import { X, GripVertical } from 'lucide-react'
import { useState, useRef, useCallback, useEffect } from 'react'

interface MapPanelProps {
  open: boolean
  onClose: () => void
  textureUrl: string | null
  planetName: string
}

function MapPanel({ open, onClose, textureUrl, planetName }: MapPanelProps) {
  const [width, setWidth] = useState(320)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

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

  return (
    <div
      className={`fixed top-0 right-0 h-full bg-gray-800/90 backdrop-blur-sm rounded-l-xl shadow-2xl border-l border-gray-600 z-40 transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width }}
    >
      <div
        className="absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center group z-10"
        onMouseDown={handleMouseDown}
      >
        <div className="w-1 h-full bg-gray-600 group-hover:bg-blue-500 transition-colors rounded-full" />
        <GripVertical size={14} className="absolute text-gray-500 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <h2 className="text-white font-bold text-lg truncate pr-2">{planetName}</h2>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white flex-shrink-0"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 h-[calc(100%-57px)]">
        {textureUrl ? (
          <img
            src={textureUrl}
            alt={`${planetName} 地图`}
            className="w-full h-auto rounded-lg object-contain"
          />
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

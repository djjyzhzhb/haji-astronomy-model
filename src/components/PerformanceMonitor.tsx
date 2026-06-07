import { useEffect, useState } from 'react'

function PerformanceMonitor() {
  const [fps, setFps] = useState(0)
  const [frameTime, setFrameTime] = useState<number>(0)
  const [objectCount, setObjectCount] = useState(0)
  
  useEffect(() => {
    let lastTime = performance.now()
    let frameCount = 0
    
    const measureFps = () => {
      frameCount++
      const now = performance.now()
      
      if (now - lastTime >= 1000) {
        setFps(frameCount)
        setFrameTime(parseFloat((1000 / frameCount).toFixed(1)))
        frameCount = 0
        lastTime = now
      }
      
      requestAnimationFrame(measureFps)
    }
    
    const id = requestAnimationFrame(measureFps)
    
    return () => cancelAnimationFrame(id)
  }, [])
  
  useEffect(() => {
    // 估算渲染对象数量
    const totalObjects = 
      1 + // 恒星
      3 + // 行星
      4 + // 卫星
      1500 + // 小行星带
      800 + // 尘埃云
      8000 // 背景星
      
    setObjectCount(totalObjects)
  }, [])
  
  return (
    <div className="bg-gray-900/85 backdrop-blur-sm rounded-lg border border-gray-700/50 px-4 py-3 text-white text-xs">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <div className="text-gray-400">FPS</div>
        <div className={`font-mono font-bold ${fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
          {fps}
        </div>
        
        <div className="text-gray-400">帧时间</div>
        <div className="font-mono font-bold">{frameTime}ms</div>
        
        <div className="text-gray-400">对象数</div>
        <div className="font-mono font-bold text-blue-400">{objectCount.toLocaleString()}</div>
      </div>
    </div>
  )
}

export default PerformanceMonitor

import { Canvas } from '@react-three/fiber'
import { Suspense, useRef, useMemo, useEffect, useState } from 'react'
import { OrbitControls, Stars } from '@react-three/drei'
import Scene from './components/Scene'
import ControlPanel from './components/ControlPanel'
import InfoPanel from './components/InfoPanel'
import PerformanceMonitor from './components/PerformanceMonitor'
import DetailPage from './components/DetailPage'
import { useStore } from './store'
import { parseHash } from './utils/router'
import * as THREE from 'three'

// ─── 移动端竖屏检测（原生视口，不使用 CSS 旋转） ───
function useMobilePortrait() {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const check = () => {
      setIsPortrait(window.innerWidth < 900 && window.innerHeight > window.innerWidth)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', () => setTimeout(check, 100))
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return isPortrait
}

function SceneWrapper() {
  const orbitControlsRef = useRef<any>(null)
  const { brightness, backgroundBrightness, backgroundColor, showNebula, distanceScale, sizeScale } = useStore()

  const controlsLimits = useMemo(() => ({
    minDistance: 5 * sizeScale,
    maxDistance: 200 * distanceScale,
  }), [distanceScale, sizeScale])

  return (
    <>
      <Stars
        radius={150 * distanceScale}
        depth={80 * distanceScale}
        count={8000}
        factor={5}
        saturation={0.3}
        fade
        speed={0.5}
      />
      {showNebula && <NebulaEffect brightness={backgroundBrightness} distanceScale={distanceScale} />}
      <Scene orbitControlsRef={orbitControlsRef} />
      <OrbitControls 
        ref={orbitControlsRef}
        enableDamping 
        dampingFactor={0.05} 
        minDistance={controlsLimits.minDistance} 
        maxDistance={controlsLimits.maxDistance}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
      />
    </>
  )
}

function NebulaEffect({ brightness, distanceScale }: { brightness: number; distanceScale: number }) {
  return (
    <group>
      <mesh position={[50 * distanceScale, 20 * distanceScale, -80 * distanceScale]}>
        <sphereGeometry args={[60 * distanceScale, 32, 32]} />
        <meshBasicMaterial 
          color="#4a148c"
          transparent
          opacity={0.05 * brightness}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      
      <mesh position={[-60 * distanceScale, -30 * distanceScale, 70 * distanceScale]}>
        <sphereGeometry args={[50 * distanceScale, 32, 32]} />
        <meshBasicMaterial 
          color="#0d47a1"
          transparent
          opacity={0.04 * brightness}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      
      <mesh position={[0, 50 * distanceScale, 60 * distanceScale]}>
        <sphereGeometry args={[40 * distanceScale, 32, 32]} />
        <meshBasicMaterial 
          color="#b71c1c"
          transparent
          opacity={0.03 * brightness}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function App() {
  const { selectedBody, backgroundColor, distanceScale, currentPage, navigateToDetail } = useStore()
  const cameraPosition = useMemo(() => [0, 30 * distanceScale, 50 * distanceScale], [distanceScale])
  const isMobilePortrait = useMobilePortrait()

  useEffect(() => {
    const route = parseHash()
    if (route.page === 'detail') {
      navigateToDetail(route.planetId)
    }
  }, [navigateToDetail])

  if (currentPage === 'detail') {
    return <DetailPage />
  }

  return (
    <div className="w-full h-full relative flex flex-col" style={{ backgroundColor }}>
      {/* Canvas 区域：横屏占满，竖屏占 60vh */}
      <div className={`relative ${isMobilePortrait ? 'mobile-canvas-area' : 'flex-1'}`}>
        <Canvas
          key={distanceScale}
          camera={{ position: cameraPosition as [number, number, number], fov: 60 }}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
          }}
          shadows
        >
          <Suspense fallback={null}>
            <SceneWrapper />
          </Suspense>
        </Canvas>
      </div>
      
      {/* 控制面板：竖屏时底部堆叠 */}
      <ControlPanel isMobilePortrait={isMobilePortrait} />
      
      {/* 性能监控（始终右上角） */}
      <div className="absolute top-2 right-2 z-20 max-md:top-1 max-md:right-1">
        <PerformanceMonitor />
      </div>

      {/* 天体信息面板 */}
      {selectedBody && (
        <div className={`
          absolute z-10
          max-md:fixed max-md:bottom-[18vh] max-md:left-1/2 max-md:-translate-x-1/2 max-md:z-50 max-md:w-[90vw]
          ${isMobilePortrait ? 'max-md:top-auto' : 'top-4 left-4'}
        `}>
          <InfoPanel />
        </div>
      )}

      {/* 标题（仅桌面端显示） */}
      <div className="absolute top-4 right-4 max-md:hidden text-white pointer-events-none">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          天文模型
        </h1>
        <p className="text-sm text-gray-400 mt-1">自定义行星系统</p>
      </div>
    </div>
  )
}

export default App

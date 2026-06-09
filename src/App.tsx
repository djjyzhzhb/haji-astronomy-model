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

// ─── 移动端检测（区分横屏/竖屏） ───
interface MobileState {
  isMobile: boolean      // 屏幕宽度 < 900
  isPortrait: boolean    // 竖屏（宽 < 高）
  isLandscape: boolean   // 横屏（宽 ≥ 高）
}

function useMobileState(): MobileState {
  const [state, setState] = useState<MobileState>({ isMobile: false, isPortrait: false, isLandscape: false })

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const isMobile = w < 900
      setState({
        isMobile,
        isPortrait: isMobile && h > w,
        isLandscape: isMobile && w >= h,
      })
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', () => setTimeout(check, 100))
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return state
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
  const { isMobile, isPortrait, isLandscape } = useMobileState()
  const [showHint, setShowHint] = useState(true)

  useEffect(() => {
    const route = parseHash()
    if (route.page === 'detail') {
      navigateToDetail(route.planetId)
    }
  }, [navigateToDetail])

  // 竖屏时显示横屏旋转提示，3 秒后自动消失
  useEffect(() => {
    if (isPortrait) {
      setShowHint(true)
      const t = setTimeout(() => setShowHint(false), 3500)
      return () => clearTimeout(t)
    } else {
      setShowHint(false)
    }
  }, [isPortrait])

  if (currentPage === 'detail') {
    return <DetailPage />
  }

  return (
    <div className="w-full h-full relative flex flex-col" style={{ backgroundColor }}>
      {/* 横屏旋转提示 */}
      {isPortrait && showHint && (
        <div className="orientation-hint animate-hint-pulse">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12C1 5.9 5.9 1 12 1s11 4.9 11 11-4.9 11-11 11S1 18.1 1 12z"/>
            <path d="M12 1v22M1 12h22"/>
            <path d="M16 8l4-4M20 4l-4 4"/>
          </svg>
          <span>旋转手机获得更佳视野</span>
        </div>
      )}

      {/* Canvas 区域 */}
      <div className={`
        relative w-full
        ${isPortrait ? 'mobile-canvas-area' : ''}
        ${isLandscape ? 'flex-1' : ''}
        ${!isMobile ? 'flex-1' : ''}
      `}>
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
      
      {/* 控制面板 */}
      <ControlPanel isMobilePortrait={isPortrait} isMobileLandscape={isLandscape} isMobile={isMobile} />
      
      {/* 性能监控 */}
      <div className="absolute top-2 right-2 z-20 max-md:top-1 max-md:right-1">
        <PerformanceMonitor />
      </div>

      {/* 天体信息面板 */}
      {selectedBody && (
        <div className={`
          absolute z-10
          ${!isMobile ? 'top-4 left-4' : ''}
          ${isPortrait ? 'max-md:fixed max-md:bottom-[16vh] max-md:left-1/2 max-md:-translate-x-1/2 max-md:z-50 max-md:w-[92vw]' : ''}
          ${isLandscape ? 'max-md:top-2 max-md:left-2 max-md:max-w-[240px]' : ''}
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

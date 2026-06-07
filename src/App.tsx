import { Canvas } from '@react-three/fiber'
import { Suspense, useRef, useMemo, useEffect } from 'react'
import { OrbitControls, Stars } from '@react-three/drei'
import Scene from './components/Scene'
import ControlPanel from './components/ControlPanel'
import InfoPanel from './components/InfoPanel'
import PerformanceMonitor from './components/PerformanceMonitor'
import DetailPage from './components/DetailPage'
import { useStore } from './store'
import { parseHash } from './utils/router'
import * as THREE from 'three'

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
    <div className="w-full h-full relative" style={{ backgroundColor }}>
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
      
      <ControlPanel />
      {/* 性能监控面板在右边 */}
      <div className="absolute top-4 right-4 z-20">
        <PerformanceMonitor />
      </div>

      {/* 信息面板在左边 */}
      {selectedBody && (
        <div className="absolute top-4 left-4 z-10 max-md:fixed max-md:top-14 max-md:left-1/2 max-md:-translate-x-1/2 max-md:z-50 max-md:w-[92vw]">
          <InfoPanel />
        </div>
      )}

      {/* 标题在右边，移动端隐藏 */}
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

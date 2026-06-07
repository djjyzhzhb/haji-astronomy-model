import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { useStore } from '../store'
import Moon from './Moon'
import Orbit from './Orbit'
import { getTextureByType } from '../utils/textureGenerator'
import { usePlanetTexture, getIsHabitable } from '../utils/planetTextureCache'
import { calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface PlanetProps {
  body: CelestialBody
  timeRef: React.MutableRefObject<number>
  moons: CelestialBody[]
}

function Planet({ body, timeRef, moons }: PlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const tiltGroupRef = useRef<THREE.Group>(null)
  const ringGroupRef = useRef<THREE.Group>(null)
  const { selectBody, showOrbits, distanceScale, sizeScale, showAtmosphere, showRings, showShadows } = useStore()

  const texture = useMemo(() => {
    try {
      if (body.textureType && body.textureType !== 'none') {
        return getTextureByType(body.textureType)
      }
    } catch (error) {
      console.error('纹理生成失败:', error)
    }
    return null
  }, [body.textureType])

  // 主页用低一档精度，roughness 和 seed 用默认中性值
  const customTexture = usePlanetTexture(
    getIsHabitable(body.textureType, body.type) ? import.meta.env.BASE_URL + '星球贴图.jpg' : null,
    'low',
    0,
    0
  )

  const ringDepthMaterial = useMemo(() => {
    return new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
  }, [])

  const previousTime = useRef(0)

  useFrame(() => {
    if (groupRef.current && body.orbitalElements) {
      const pos = calculateOrbitalPositionScaled(timeRef.current, body.orbitalElements, distanceScale, 50)
      groupRef.current.position.set(pos.x, pos.y, pos.z)
    } else if (groupRef.current && body.distance && body.orbitSpeed) {
      const angle = timeRef.current * body.orbitSpeed * 0.1
      groupRef.current.position.x = Math.cos(angle) * body.distance * distanceScale
      groupRef.current.position.z = Math.sin(angle) * body.distance * distanceScale
    }
    
    // 使用时间差来更新自转，这样就和时间缩放同步了
    if (meshRef.current && body.rotationSpeed) {
      const delta = timeRef.current - previousTime.current
      meshRef.current.rotation.y += body.rotationSpeed * delta
      previousTime.current = timeRef.current
    }
    
    // 行星环跟着星球自转而旋转
    if (ringGroupRef.current && body.hasRing && showRings) {
      // 环在内部 group 中旋转了，所以我们需要旋转 z 轴而不是 y 轴
      ringGroupRef.current.children[0].rotation.z += (body.rotationSpeed || 0.01) * (timeRef.current - previousTime.current)
    }
  })

  const scaledRadius = body.radius * sizeScale

  return (
    <group ref={groupRef}>
      {/* 倾斜轴组 - 用于轴向倾斜 */}
      <group ref={tiltGroupRef} rotation={[0, 0, body.axialTilt || 0]}>
        {/* 行星环放在行星后面，避免闪烁 */}
      {body.hasRing && showRings && (
        <group ref={ringGroupRef} rotation={[-Math.PI / 2.5, 0, 0]}>
          {/* 内环 - 较亮 */}
          <mesh castShadow={showShadows} customDepthMaterial={ringDepthMaterial} renderOrder={1}>
            <ringGeometry args={[scaledRadius * 1.4, scaledRadius * 1.8, 128, 8]} />
            <meshStandardMaterial 
              color={body.ringColor || '#d4a574'}
              emissive={body.ringColor || '#d4a574'}
              emissiveIntensity={0.3}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              roughness={0.35}
              metalness={0.05}
            />
          </mesh>
          {/* 中环 - 中等亮度 */}
          <mesh castShadow={showShadows} customDepthMaterial={ringDepthMaterial} renderOrder={1}>
            <ringGeometry args={[scaledRadius * 1.8, scaledRadius * 2.1, 128, 8]} />
            <meshStandardMaterial 
              color={body.ringColor || '#d4a574'}
              emissive={body.ringColor || '#d4a574'}
              emissiveIntensity={0.2}
              transparent
              opacity={0.55}
              side={THREE.DoubleSide}
              roughness={0.4}
              metalness={0.05}
            />
          </mesh>
          {/* 外环 - 较暗 */}
          <mesh castShadow={showShadows} customDepthMaterial={ringDepthMaterial} renderOrder={1}>
            <ringGeometry args={[scaledRadius * 2.1, scaledRadius * 2.4, 128, 8]} />
            <meshStandardMaterial 
              color={body.ringColor || '#d4a574'}
              emissive={body.ringColor || '#d4a574'}
              emissiveIntensity={0.12}
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              roughness={0.5}
              metalness={0.05}
            />
          </mesh>
          {/* 添加一些细节粒子 */}
          <points renderOrder={3}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={200}
                array={new Float32Array(
                  Array.from({ length: 600 }, () => {
                    const angle = Math.random() * Math.PI * 2
                    const radius = scaledRadius * (1.6 + Math.random() * 0.3)
                    const thickness = (Math.random() - 0.5) * 0.02
                    return [
                      Math.cos(angle) * radius,
                      Math.sin(angle) * radius,
                      thickness
                    ]
                  }).flat()
                )}
                itemSize={3}
              />
            </bufferGeometry>
            <pointsMaterial
              color="#ffffff"
              size={0.03}
              transparent
              opacity={0.6}
              sizeAttenuation
            />
          </points>
        </group>
      )}
        
        <mesh 
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation()
            selectBody(body)
          }}
          castShadow={showShadows}
          receiveShadow={showShadows}
          renderOrder={2}
        >
          <sphereGeometry args={[scaledRadius, 128, 128]} />
          {customTexture ? (
            <meshStandardMaterial 
              map={customTexture}
              roughness={0.7}
              metalness={0.05}
            />
          ) : texture ? (
            <meshStandardMaterial 
              map={texture}
              roughness={0.7}
              metalness={0.05}
            />
          ) : (
            <meshStandardMaterial 
              color={body.color}
              roughness={0.8}
              metalness={0.05}
            />
          )}
        </mesh>
        
        {/* 大气层效果 - 仅类地行星 */}
        {body.textureType === 'earth-like' && showAtmosphere && (
          <group renderOrder={3}>
            <mesh scale={[1.05, 1.05, 1.05]}>
              <sphereGeometry args={[scaledRadius, 64, 64]} />
              <meshBasicMaterial 
                color="#4a90d9"
                transparent
                opacity={0.18}
                side={THREE.BackSide}
                depthWrite={false}
              />
            </mesh>
            <mesh scale={[1.1, 1.1, 1.1]}>
              <sphereGeometry args={[scaledRadius, 64, 64]} />
              <meshBasicMaterial 
                color="#66bbee"
                transparent
                opacity={0.08}
                side={THREE.BackSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
        )}
        
        {/* 卫星 */}
        {moons.map(moon => (
          <group key={moon.id}>
            {showOrbits && moon.distance && (
              <Orbit body={moon} />
            )}
            <Moon body={moon} timeRef={timeRef} />
          </group>
        ))}
      </group>
    </group>
  )
}

export default Planet

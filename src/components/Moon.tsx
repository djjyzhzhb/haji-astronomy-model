import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { useStore } from '../store'
import { getTextureByType } from '../utils/textureGenerator'
import { calculateOrbitalPositionFromT, calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface MoonProps {
  body: CelestialBody
}

function Moon({ body }: MoonProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const tiltGroupRef = useRef<THREE.Group>(null)
  const { selectBody, distanceScale, sizeScale } = useStore()

  const texture = useMemo(() => {
    if (body.textureType && body.textureType !== 'none') {
      return getTextureByType(body.textureType)
    }
    return null
  }, [body.textureType])

  const previousTime = useRef(0)

  useFrame(() => {
    const T = useStore.getState().timeSystem.T

    // 公转位置：优先使用 orbitalPeriodDays（来自设定数据），否则回退
    if (groupRef.current && body.orbitalElements) {
      let pos: { x: number; y: number; z: number }
      if (body.orbitalPeriodDays) {
        pos = calculateOrbitalPositionFromT(T, body.orbitalPeriodDays, body.orbitalElements)
        groupRef.current.position.set(pos.x * distanceScale, pos.y * distanceScale, pos.z * distanceScale)
      } else {
        pos = calculateOrbitalPositionScaled(T, body.orbitalElements, distanceScale, 30)
        groupRef.current.position.set(pos.x, pos.y, pos.z)
      }
    } else if (groupRef.current && body.distance && body.orbitSpeed) {
      const angle = T * body.orbitSpeed * 0.1
      groupRef.current.position.x = Math.cos(angle) * body.distance * distanceScale
      groupRef.current.position.z = Math.sin(angle) * body.distance * distanceScale
    }
    
    // 自转：每本地日自转一圈（2π rad），统一与行星自转逻辑一致
    if (meshRef.current) {
      const delta = T - previousTime.current
      meshRef.current.rotation.y += 2 * Math.PI * delta
      previousTime.current = T
    }
  })

  const scaledRadius = body.radius * sizeScale

  return (
    <group ref={groupRef}>
      <group ref={tiltGroupRef} rotation={[0, 0, body.axialTilt || 0]}>
        <mesh 
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation()
            selectBody(body)
          }}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[scaledRadius, 32, 32]} />
          {texture ? (
            <meshStandardMaterial 
              map={texture}
              roughness={0.95}
              metalness={0.02}
            />
          ) : (
            <meshStandardMaterial 
              color={body.color}
              roughness={0.95}
              metalness={0.02}
            />
          )}
        </mesh>
      </group>
    </group>
  )
}

export default Moon

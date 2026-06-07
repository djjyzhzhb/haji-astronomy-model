import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { useStore } from '../store'
import { getTextureByType } from '../utils/textureGenerator'
import { calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface MoonProps {
  body: CelestialBody
  timeRef: React.MutableRefObject<number>
}

function Moon({ body, timeRef }: MoonProps) {
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
    if (groupRef.current && body.orbitalElements) {
      const pos = calculateOrbitalPositionScaled(timeRef.current, body.orbitalElements, distanceScale, 30)
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

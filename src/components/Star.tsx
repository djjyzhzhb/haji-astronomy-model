import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { useStore } from '../store'

interface StarProps {
  body: CelestialBody
}

function Star({ body }: StarProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { selectBody, brightness, sizeScale, distanceScale, lightIntensity, starGlow } = useStore()

  const scaledRadius = body.radius * sizeScale

  return (
    <group>
      {/* 主光源 - 点光源，从恒星位置照亮所有行星（白色光照，避免偏色） */}
      <pointLight 
        position={[0, 0, 0]}
        intensity={2.0 * brightness * lightIntensity} 
        distance={500 * distanceScale}
        decay={0.0}
        color="#ffffff"
      />
      
      {/* 辅助点光源，增加氛围感（白色光照） */}
      <pointLight 
        position={[0, 0, 0]}
        intensity={0.8 * brightness * lightIntensity} 
        distance={300 * distanceScale}
        decay={0.0}
        color="#ffffff"
      />
      
      <mesh 
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          selectBody(body)
        }}
      >
        <sphereGeometry args={[scaledRadius, 64, 64]} />
        <meshBasicMaterial 
          color={body.color}
        />
      </mesh>
      
      {/* 恒星光晕效果 */}
      <mesh scale={[1.3 * starGlow, 1.3 * starGlow, 1.3 * starGlow]}>
        <sphereGeometry args={[scaledRadius, 32, 32]} />
        <meshBasicMaterial 
          color={body.color}
          transparent
          opacity={0.45 * starGlow}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* 更外层光晕 */}
      <mesh scale={[1.8 * starGlow, 1.8 * starGlow, 1.8 * starGlow]}>
        <sphereGeometry args={[scaledRadius, 32, 32]} />
        <meshBasicMaterial 
          color={body.emissiveColor || '#ffaa00'}
          transparent
          opacity={0.25 * starGlow}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      
      {/* 最外层光晕 */}
      <mesh scale={[2.5 * starGlow, 2.5 * starGlow, 2.5 * starGlow]}>
        <sphereGeometry args={[scaledRadius, 24, 24]} />
        <meshBasicMaterial 
          color="#ffcc00"
          transparent
          opacity={0.1 * starGlow}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* 脉动发光效果 */}
      <mesh scale={[3.2 * starGlow, 3.2 * starGlow, 3.2 * starGlow]}>
        <sphereGeometry args={[scaledRadius, 24, 24]} />
        <meshBasicMaterial 
          color="#ffee88"
          transparent
          opacity={0.06 * starGlow}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default Star

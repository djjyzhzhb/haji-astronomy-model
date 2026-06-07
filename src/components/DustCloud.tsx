import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'

interface DustCloudProps {
  radius: number
  thickness: number
  count: number
  color?: string
  opacity?: number
}

function DustCloud({ radius, thickness, count, color = '#6677aa', opacity = 0.08 }: DustCloudProps) {
  const meshRef = useRef<THREE.Points>(null)
  const { distanceScale } = useStore()

  const { positions, colors, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colorsArr = new Float32Array(count * 3)
    const sizesArr = new Float32Array(count)
    const phasesArr = new Float32Array(count)
    
    const colorObj = new THREE.Color(color)
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      const r = radius + (Math.random() - 0.5) * thickness
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      
      const variation = 0.6 + Math.random() * 0.8
      colorsArr[i * 3] = colorObj.r * variation
      colorsArr[i * 3 + 1] = colorObj.g * variation
      colorsArr[i * 3 + 2] = colorObj.b * variation
      
      sizesArr[i] = 1.5 + Math.random() * 2.5
      phasesArr[i] = Math.random() * Math.PI * 2
    }
    
    return { positions, colors: colorsArr, sizes: sizesArr, phases: phasesArr }
  }, [count, color, radius, thickness])

  const geometryRef = useRef<THREE.BufferGeometry>(null)

  useFrame((_) => {
    if (!meshRef.current || !geometryRef.current) return
    
    const time = _
    meshRef.current.rotation.y += 0.0005
  })

  return (
    <points ref={meshRef} key={distanceScale}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={sizes.length}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1.5}
        vertexColors
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default DustCloud

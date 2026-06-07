import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'

interface AsteroidBeltProps {
  innerRadius: number
  outerRadius: number
  count: number
  color?: string
}

function AsteroidBelt({ innerRadius, outerRadius, count, color = '#8b8b8b' }: AsteroidBeltProps) {
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
      const phi = (Math.random() - 0.5) * 0.2 // 轻微的高度分布
      const radius = innerRadius + Math.random() * (outerRadius - innerRadius)
      
      positions[i * 3] = Math.cos(theta) * radius
      positions[i * 3 + 1] = Math.sin(phi) * 2
      positions[i * 3 + 2] = Math.sin(theta) * radius
      
      const variation = 0.7 + Math.random() * 0.6
      colorsArr[i * 3] = colorObj.r * variation
      colorsArr[i * 3 + 1] = colorObj.g * variation
      colorsArr[i * 3 + 2] = colorObj.b * variation
      
      sizesArr[i] = 0.3 + Math.random() * 0.7
      phasesArr[i] = Math.random() * Math.PI * 2
    }
    
    return { positions, colors: colorsArr, sizes: sizesArr, phases: phasesArr }
  }, [count, color, innerRadius, outerRadius])

  const geometryRef = useRef<THREE.BufferGeometry>(null)

  useFrame((_, delta) => {
    if (!meshRef.current || !geometryRef.current) return
    
    const time = _
    const positions = geometryRef.current.attributes.position.array as Float32Array
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const currentAngle = Math.atan2(positions[i3 + 2], positions[i3])
      const radius = Math.sqrt(positions[i3] * positions[i3] + positions[i3 + 2] * positions[i3 + 2])
      const speed = 0.1 / radius // 开普勒第三定律：距离越远速度越慢
      
      const newAngle = currentAngle + speed * delta * 2
      positions[i3] = Math.cos(newAngle) * radius
      positions[i3 + 2] = Math.sin(newAngle) * radius
    }
    
    geometryRef.current.attributes.position.needsUpdate = true
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
        size={0.4}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

export default AsteroidBelt

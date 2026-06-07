import { useMemo } from 'react'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { getOrbitPoints } from '../utils/keplerOrbit'
import { useStore } from '../store'

interface OrbitProps {
  body: CelestialBody
  color?: string
  opacity?: number
}

function Orbit({ body, color = '#ffffff', opacity = 0.3 }: OrbitProps) {
  const { distanceScale } = useStore()

  const positions = useMemo(() => {
    let pts: number[] = []
    
    if (body.orbitalElements) {
      const points = getOrbitPoints(body.orbitalElements, 128, distanceScale)
      pts = points.flatMap(p => [p.x, p.y, p.z])
    } else {
      const radius = (body.distance || 10) * distanceScale
      for (let i = 0; i <= 128; i++) {
        const angle = (i / 128) * Math.PI * 2
        pts.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      }
    }
    
    return pts
  }, [body, distanceScale])

  return (
    <line key={distanceScale}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={new Float32Array(positions)}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </line>
  )
}

export default Orbit

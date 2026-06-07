import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import Star from './Star'
import Planet from './Planet'
import Moon from './Moon'
import Orbit from './Orbit'
import AsteroidBelt from './AsteroidBelt'
import DustCloud from './DustCloud'
import * as THREE from 'three'
import { calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface SceneProps {
  orbitControlsRef: React.RefObject<any>
}

interface BodyPosition {
  [key: string]: THREE.Vector3
}

function Scene({ orbitControlsRef }: SceneProps) {
  const { timeScale, isPaused, showOrbits, focusBody, distanceScale, ambientLight, showAsteroids, showDustCloud, celestialBodies } = useStore()
  const timeRef = useRef(0)
  const [bodyPositions, setBodyPositions] = useState<BodyPosition>({})
  const hasFocused = useRef(false)

  useFrame((state, delta) => {
    if (!isPaused) {
      timeRef.current += delta * timeScale
    }

    const newPositions: BodyPosition = {}
    
    const star = celestialBodies.find(b => b.type === 'star')
    if (star) {
      newPositions[star.id] = new THREE.Vector3(0, 0, 0)
    }

    celestialBodies.filter(b => b.type === 'planet').forEach(planet => {
      if (planet.orbitalElements) {
        const pos = calculateOrbitalPositionScaled(timeRef.current, planet.orbitalElements, distanceScale, 50)
        newPositions[planet.id] = new THREE.Vector3(pos.x, pos.y, pos.z)
      } else if (planet.distance && planet.orbitSpeed) {
        const angle = timeRef.current * planet.orbitSpeed * 0.1
        const x = Math.cos(angle) * planet.distance * distanceScale
        const z = Math.sin(angle) * planet.distance * distanceScale
        newPositions[planet.id] = new THREE.Vector3(x, 0, z)
      }
    })

    celestialBodies.filter(b => b.type === 'moon').forEach(moon => {
      if (moon.parentId) {
        const parentPos = newPositions[moon.parentId]
        if (parentPos) {
          if (moon.orbitalElements) {
            const pos = calculateOrbitalPositionScaled(timeRef.current, moon.orbitalElements, distanceScale, 30)
            newPositions[moon.id] = new THREE.Vector3(
              parentPos.x + pos.x, parentPos.y + pos.y, parentPos.z + pos.z)
          } else if (moon.distance && moon.orbitSpeed) {
            const angle = timeRef.current * moon.orbitSpeed * 0.1
            const x = parentPos.x + Math.cos(angle) * moon.distance * distanceScale
            const z = parentPos.z + Math.sin(angle) * moon.distance * distanceScale
            newPositions[moon.id] = new THREE.Vector3(x, 0, z)
          }
        }
      }
    })

    setBodyPositions(newPositions)

    if (focusBody && orbitControlsRef.current) {
      const targetPos = newPositions[focusBody.id]
      if (targetPos) {
        if (!hasFocused.current) {
          orbitControlsRef.current.target.copy(targetPos)
          hasFocused.current = true
        } else {
          orbitControlsRef.current.target.copy(targetPos)
        }
      }
    } else if (hasFocused.current) {
      hasFocused.current = false
    }
  })

  const star = celestialBodies.find(b => b.type === 'star')
  const planets = celestialBodies.filter(b => b.type === 'planet')
  const moons = celestialBodies.filter(b => b.type === 'moon')

  return (
    <group>
      {/* 环境光 */}
      <ambientLight intensity={ambientLight} color="#ffffff" />
      
      {star && <Star body={star} timeRef={timeRef} />}
      
      {/* 主小行星带 */}
      {showAsteroids && <AsteroidBelt innerRadius={45} outerRadius={55} count={1500} color="#8b7355" />}
      
      {/* 外尘埃云 */}
      {showDustCloud && <DustCloud radius={70} thickness={25} count={800} color="#5566aa" opacity={0.06} />}
      
      {planets.map(planet => (
        <group key={planet.id}>
          {showOrbits && <Orbit body={planet} />}
          <Planet 
            body={planet} 
            timeRef={timeRef}
            moons={moons.filter(m => m.parentId === planet.id)}
          />
        </group>
      ))}
    </group>
  )
}

export default Scene

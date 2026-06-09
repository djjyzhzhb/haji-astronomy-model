import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import Star from './Star'
import Planet from './Planet'
import Moon from './Moon'
import Orbit from './Orbit'
import AsteroidBelt from './AsteroidBelt'
import DustCloud from './DustCloud'
import * as THREE from 'three'
import { SECONDS_PER_DAY } from '../config/constants'
import { calculateOrbitalPositionFromT, calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface SceneProps {
  orbitControlsRef: React.RefObject<any>
}

function Scene({ orbitControlsRef }: SceneProps) {
  const { timeSystem, updateTimeSystem, showOrbits, focusBody, distanceScale, ambientLight, showAsteroids, showDustCloud, celestialBodies } = useStore()
  const bodyRefs = useRef<Map<string, THREE.Group>>(new Map())

  useFrame((state, delta) => {
    if (!timeSystem.isPaused) {
      const dtDays = (delta * timeSystem.timeScale) / SECONDS_PER_DAY
      updateTimeSystem({ T: timeSystem.T + dtDays })
    }

    const T = useStore.getState().timeSystem.T
    const positions = new Map<string, THREE.Vector3>()
    
    const star = celestialBodies.find(b => b.type === 'star')
    if (star) {
      positions.set(star.id, new THREE.Vector3(0, 0, 0))
    }

    celestialBodies.filter(b => b.type === 'planet').forEach(planet => {
      if (planet.orbitalElements) {
        if (planet.orbitalPeriodDays) {
          const pos = calculateOrbitalPositionFromT(T, planet.orbitalPeriodDays, planet.orbitalElements)
          positions.set(planet.id, new THREE.Vector3(pos.x * distanceScale, pos.y * distanceScale, pos.z * distanceScale))
        } else {
          const pos = calculateOrbitalPositionScaled(T, planet.orbitalElements, distanceScale, 50)
          positions.set(planet.id, new THREE.Vector3(pos.x, pos.y, pos.z))
        }
      } else if (planet.distance && planet.orbitSpeed) {
        const angle = T * planet.orbitSpeed * 0.1
        const x = Math.cos(angle) * planet.distance * distanceScale
        const z = Math.sin(angle) * planet.distance * distanceScale
        positions.set(planet.id, new THREE.Vector3(x, 0, z))
      }
    })

    celestialBodies.filter(b => b.type === 'moon').forEach(moon => {
      if (moon.parentId) {
        const parentPos = positions.get(moon.parentId)
        if (parentPos) {
          if (moon.orbitalElements) {
            if (moon.orbitalPeriodDays) {
              const pos = calculateOrbitalPositionFromT(T, moon.orbitalPeriodDays, moon.orbitalElements)
              positions.set(moon.id, new THREE.Vector3(
                parentPos.x + pos.x * distanceScale, parentPos.y + pos.y * distanceScale, parentPos.z + pos.z * distanceScale))
            } else {
              const pos = calculateOrbitalPositionScaled(T, moon.orbitalElements, distanceScale, 30)
              positions.set(moon.id, new THREE.Vector3(
                parentPos.x + pos.x, parentPos.y + pos.y, parentPos.z + pos.z))
            }
          } else if (moon.distance && moon.orbitSpeed) {
            const angle = T * moon.orbitSpeed * 0.1
            const x = parentPos.x + Math.cos(angle) * moon.distance * distanceScale
            const z = parentPos.z + Math.sin(angle) * moon.distance * distanceScale
            positions.set(moon.id, new THREE.Vector3(x, 0, z))
          }
        }
      }
    })

    // 直接操作 Three.js 对象（替代 setBodyPositions）
    positions.forEach((pos, id) => {
      const obj = bodyRefs.current.get(id)
      if (obj) obj.position.copy(pos)
    })

    // 聚焦逻辑
    if (focusBody && orbitControlsRef.current) {
      const targetPos = positions.get(focusBody.id)
      if (targetPos) {
        orbitControlsRef.current.target.copy(targetPos)
      }
    }
  })

  const star = celestialBodies.find(b => b.type === 'star')
  const planets = celestialBodies.filter(b => b.type === 'planet')
  const moons = celestialBodies.filter(b => b.type === 'moon')

  return (
    <group>
      {/* 环境光 */}
      <ambientLight intensity={ambientLight} color="#ffffff" />
      
      {star && <Star body={star} />}
      
      {/* 主小行星带 */}
      {showAsteroids && <AsteroidBelt innerRadius={45} outerRadius={55} count={1500} color="#8b7355" />}
      
      {/* 外尘埃云 */}
      {showDustCloud && <DustCloud radius={70} thickness={25} count={800} color="#5566aa" opacity={0.06} />}
      
      {planets.map(planet => (
        <group key={planet.id}>
          {showOrbits && <Orbit body={planet} />}
          <Planet 
            body={planet}
            moons={moons.filter(m => m.parentId === planet.id)}
          />
        </group>
      ))}
    </group>
  )
}

export default Scene

import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import Star from './Star'
import Planet from './Planet'
import Orbit from './Orbit'
import AsteroidBelt from './AsteroidBelt'
import DustCloud from './DustCloud'
import { calculateOrbitalPositionFromT, calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface SceneProps {
  orbitControlsRef: React.RefObject<any>
}

/** 计算天体在当前 T 的时刻的世界坐标（处理 moon 需要叠加 parent 位置） */
function getWorldPosition(
  bodyId: string,
  T: number,
  distanceScale: number,
  bodies: ReturnType<typeof useStore.getState>['celestialBodies']
): { x: number; y: number; z: number } | null {
  const body = bodies.find(b => b.id === bodyId)
  if (!body?.orbitalElements) return null

  const calcPos = () => {
    if (!body.orbitalElements) return { x: 0, y: 0, z: 0 }
    if (body.orbitalPeriodDays) {
      return calculateOrbitalPositionFromT(T, body.orbitalPeriodDays, body.orbitalElements)
    }
    return calculateOrbitalPositionScaled(T, body.orbitalElements, 1, 50)
  }

  if (body.type === 'moon' && body.parentId) {
    const parentPos = getWorldPosition(body.parentId, T, distanceScale, bodies)
    if (!parentPos) return null
    const moonPos = calcPos()
    return {
      x: parentPos.x + moonPos.x * distanceScale,
      y: parentPos.y + moonPos.y * distanceScale,
      z: parentPos.z + moonPos.z * distanceScale,
    }
  }

  // planet or star
  const pos = calcPos()
  return {
    x: pos.x * distanceScale,
    y: pos.y * distanceScale,
    z: pos.z * distanceScale,
  }
}

function Scene({ orbitControlsRef }: SceneProps) {
  const { timeSystem, updateTimeSystem, showOrbits, focusBody, distanceScale, ambientLight, showAsteroids, showDustCloud, celestialBodies } = useStore()

  useFrame((_state, delta) => {
    const ts = useStore.getState().timeSystem
    if (!ts.isPaused) {
      // dtDays = 帧间隔(秒) × (timeScale / 10)
      // timeScale=10 时物理速度 = 旧值 1.0（1本地日/秒）
      // 范围：timeScale 0.1→物理速度0.01   timeScale 1000→物理速度100
      const dtDays = delta * ts.timeScale / 10
      updateTimeSystem({ T: ts.T + dtDays })
    }

    // 聚焦逻辑
    const T = useStore.getState().timeSystem.T
    if (focusBody && orbitControlsRef.current) {
      const worldPos = getWorldPosition(focusBody.id, T, distanceScale, celestialBodies)
      if (worldPos) {
        orbitControlsRef.current.target.set(worldPos.x, worldPos.y, worldPos.z)
      }
    }
  })

  const star = celestialBodies.find(b => b.type === 'star')
  const planets = celestialBodies.filter(b => b.type === 'planet')
  const moons = celestialBodies.filter(b => b.type === 'moon')

  return (
    <group>
      <ambientLight intensity={ambientLight} color="#ffffff" />
      
      {star && <Star body={star} />}
      {showAsteroids && <AsteroidBelt innerRadius={45} outerRadius={55} count={1500} color="#8b7355" />}
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
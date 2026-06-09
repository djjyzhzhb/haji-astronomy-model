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

function Scene({ orbitControlsRef }: SceneProps) {
  const { timeSystem, updateTimeSystem, showOrbits, focusBody, distanceScale, ambientLight, showAsteroids, showDustCloud, celestialBodies } = useStore()

  useFrame((state, delta) => {
    const ts = useStore.getState().timeSystem
    if (!ts.isPaused) {
      // delta 是帧间隔（秒），timeScale 直接表示"每真实秒推进多少本地日"
      // 例如 timeScale=1 时，1 秒 = 1 本地日；timeScale=100 时，1 秒 = 100 本地日
      const dtDays = delta * ts.timeScale
      updateTimeSystem({ T: ts.T + dtDays })
    }

    // 聚焦逻辑：Scene 只负责控制器的 target 跟随
    const T = useStore.getState().timeSystem.T
    if (focusBody && orbitControlsRef.current) {
      const planet = celestialBodies.find(b => b.id === focusBody.id)
      if (planet?.orbitalElements) {
        let pos: { x: number; y: number; z: number }
        if (planet.orbitalPeriodDays) {
          pos = calculateOrbitalPositionFromT(T, planet.orbitalPeriodDays, planet.orbitalElements)
        } else {
          pos = calculateOrbitalPositionScaled(T, planet.orbitalElements, distanceScale, 50)
        }
        orbitControlsRef.current.target.set(
          pos.x * distanceScale, pos.y * distanceScale, pos.z * distanceScale
        )
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

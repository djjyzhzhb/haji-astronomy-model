import { useRef, useMemo, useImperativeHandle, forwardRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { altAzToDirection, applyAtmosphericRefraction, worldToSkyPosition } from '../utils/surfaceCoords'
import { calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

interface SurfaceViewProps {
  planet: CelestialBody
  dayTime: number
  yearProgress: number
  globalTime: number
  latitude: number
  longitude: number
  fov: number
  onFovChange: (fov: number) => void
  celestialBodies: CelestialBody[]
  showAtmosphere: boolean
  atmosphereColor: string
  atmosphereRefraction: boolean
  refractionCoefficient: number
  markerSizeScale: number
  showConstellations: boolean
  constellationLineWidth: number
  showEcliptic: boolean
  eclipticLineWidth: number
  showHorizon: boolean
}

export interface SurfaceViewHandle {
  setYawPitch: (yaw: number, pitch: number) => void
}

// 天空穹顶着色器
const skyDomeVertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vNormal = normalize(normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyDomeFragmentShader = `
  uniform vec3 sunDirection;
  uniform float sunAltitude;
  uniform vec3 atmosphereColor;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;

  void main() {
    vec3 viewDir = normalize(vWorldPosition - cameraPosition);

    // 天顶方向 (Y轴向上)
    float zenithDot = max(viewDir.y, 0.0);

    // 地平线附近
    float horizonFactor = 1.0 - zenithDot;

    // 太阳方向
    float sunDot = max(dot(viewDir, normalize(sunDirection)), 0.0);

    // 三段式昼夜过渡阈值 (6° = 0.1047 rad)
    float dayThreshold = 0.105;
    float nightThreshold = -0.105;

    // 使用 smoothstep 创建昼夜分界
    float dayFactor = smoothstep(nightThreshold, dayThreshold, sunAltitude);

    // === 白天颜色 (dayFactor = 1) ===
    vec3 dayZenith = vec3(0.2, 0.4, 0.8);
    vec3 dayHorizon = vec3(0.7, 0.85, 1.0);

    // === 黑夜颜色 (dayFactor = 0) ===
    vec3 nightZenith = vec3(0.0, 0.0, 0.01);
    vec3 nightHorizon = vec3(0.01, 0.01, 0.03);

    // === 晨昏过渡颜色（橙/红地平线） ===
    vec3 twilightZenith = vec3(0.05, 0.08, 0.2);
    vec3 twilightHorizon = vec3(0.9, 0.3, 0.1);

    // 天顶颜色：从黑夜到黄昏到白天
    vec3 zenithColor;
    if (dayFactor < 0.5) {
      zenithColor = mix(nightZenith, twilightZenith, dayFactor * 2.0);
    } else {
      zenithColor = mix(twilightZenith, dayZenith, (dayFactor - 0.5) * 2.0);
    }

    // 地平线颜色：从黑夜到黄昏到白天
    vec3 horizonColor;
    if (dayFactor < 0.5) {
      horizonColor = mix(nightHorizon, twilightHorizon, dayFactor * 2.0);
    } else {
      horizonColor = mix(twilightHorizon, dayHorizon, (dayFactor - 0.5) * 2.0);
    }

    // 混合天顶和地平线颜色
    vec3 skyColor = mix(horizonColor, zenithColor, zenithDot);

    // 太阳附近的光晕（仅在白天/黄昏可见）
    float sunGlow = pow(sunDot, 8.0) * 0.8 * dayFactor;
    vec3 sunColor = mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.95, 0.8), dayFactor);
    skyColor += sunColor * sunGlow;

    // 地平线雾效
    float fog = pow(horizonFactor, 2.0) * 0.3;
    skyColor = mix(skyColor, horizonColor, fog);

    gl_FragColor = vec4(skyColor, 1.0);
  }
`

// 地面着色器 - 昼夜阴影
const groundVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const groundFragmentShader = `
  uniform vec3 sunDirection;
  uniform float sunAltitude;
  uniform vec3 groundColor;
  varying vec3 vWorldPosition;

  void main() {
    // 太阳在水平面上的投影方向（处理天顶退化情况）
    vec2 sunHoriz = vec2(sunDirection.x, sunDirection.z);
    float sunHorizLen = length(sunHoriz);
    vec2 sunDir2D = sunHorizLen < 0.001 ? vec2(1.0, 0.0) : sunHoriz / sunHorizLen;
    
    // 当前像素相对于地面中心的方向
    vec2 posDir2D = normalize(vec2(vWorldPosition.x, vWorldPosition.z));
    
    // 朝向太阳的程度：1 = 正对太阳方向，-1 = 背对太阳
    float facingSun = dot(posDir2D, sunDir2D);
    
    // 昼夜因子
    float nightThreshold = -0.105;
    float dayThreshold = 0.105;
    float dayFactor = smoothstep(nightThreshold, dayThreshold, sunAltitude);
    
    // 太阳高度角越高，光照越均匀；越低，阴影梯度越明显
    float gradientStrength = 1.0 - smoothstep(0.0, 0.5, sunAltitude);
    float illumination = mix(1.0, smoothstep(-0.7, 0.7, facingSun) * 0.7 + 0.3, gradientStrength);
    
    // 日间颜色和夜间颜色
    vec3 dayColor = groundColor * 0.85;
    vec3 nightColor = groundColor * 0.02;
    
    // 混合日间和夜间，叠加太阳高度角因子
    float shadowFactor = illumination * dayFactor;
    vec3 color = mix(nightColor, dayColor, shadowFactor);
    
    gl_FragColor = vec4(color, 1.0);
  }
`

// 星空粒子
function StarField({ sunAltitude }: { sunAltitude: number }) {
  const starsRef = useRef<THREE.Points>(null)

  const starData = useMemo(() => {
    const count = 3000
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const radius = 500 + Math.random() * 300

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)

      sizes[i] = 0.5 + Math.random() * 1.5
    }

    return { positions, sizes }
  }, [])

  useFrame((state) => {
    if (starsRef.current) {
      starsRef.current.rotation.y = state.clock.elapsedTime * 0.005
    }
  })

  // 昼夜透明度：白天 0.1，夜晚 0.8，晨昏平滑过渡
  const nightThreshold = -0.105
  const dayThreshold = 0.105
  const dayFactor = Math.max(0, Math.min(1, (sunAltitude - nightThreshold) / (dayThreshold - nightThreshold)))
  const opacity = 0.1 + (1 - dayFactor) * 0.7

  return (
    <points ref={starsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={starData.positions.length / 3}
          array={starData.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={starData.sizes.length}
          array={starData.sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={1.2}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// 星座连线
function ConstellationLines({ lineWidth }: { lineWidth: number }) {
  const linesRef = useRef<THREE.LineSegments>(null)

  // 生成随机星座连线
  const lineData = useMemo(() => {
    const count = 50
    const positions = new Float32Array(count * 3 * 2)
    
    for (let i = 0; i < count; i++) {
      // 随机生成两个点
      const theta1 = Math.random() * Math.PI * 2
      const phi1 = Math.acos(2 * Math.random() - 1)
      const radius = 800
      
      const theta2 = theta1 + (Math.random() - 0.5) * Math.PI / 4
      const phi2 = phi1 + (Math.random() - 0.5) * Math.PI / 4
      
      positions[i * 6] = radius * Math.sin(phi1) * Math.cos(theta1)
      positions[i * 6 + 1] = radius * Math.sin(phi1) * Math.sin(theta1)
      positions[i * 6 + 2] = radius * Math.cos(phi1)
      
      positions[i * 6 + 3] = radius * Math.sin(phi2) * Math.cos(theta2)
      positions[i * 6 + 4] = radius * Math.sin(phi2) * Math.sin(theta2)
      positions[i * 6 + 5] = radius * Math.cos(phi2)
    }
    
    return positions
  }, [])

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={lineData.length / 3}
          array={lineData}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#66ccff"
        linewidth={lineWidth}
        transparent
        opacity={0.7}
      />
    </lineSegments>
  )
}

// 黄道线（行星轨道面在天球上的投影）
function EclipticLine({ lineWidth, axialTilt }: { lineWidth: number; axialTilt: number }) {
  const points = useMemo(() => {
    const count = 100
    const positions = []
    const tiltDeg = axialTilt * (180 / Math.PI) // 转换为度数
    
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2
      // 黄道 = 行星轨道面在天球上的投影，相对于天赤道倾斜 axialTilt
      const x = 800 * Math.cos(angle)
      const y = 800 * Math.sin(angle) * Math.sin(tiltDeg * Math.PI / 180)
      const z = 800 * Math.sin(angle) * Math.cos(tiltDeg * Math.PI / 180)
      positions.push(new THREE.Vector3(x, y, z))
    }
    
    return positions
  }, [axialTilt])

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#ffcc00"
        linewidth={lineWidth}
        transparent
        opacity={0.8}
      />
    </line>
  )
}

// 地平线
function HorizonCircle() {
  const points = useMemo(() => {
    const count = 100
    const positions = []
    
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2
      const x = 800 * Math.cos(angle)
      const y = 0
      const z = 800 * Math.sin(angle)
      positions.push(new THREE.Vector3(x, y, z))
    }
    
    return positions
  }, [])

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#ffffff"
        linewidth={1}
        transparent
        opacity={0.6}
      />
    </line>
  )
}

// 方向标识（东、西、南、北）
function DirectionMarkers() {
  const markerRadius = 700
  
  const directions = useMemo(() => [
    { x: 0, z: -markerRadius, color: '#ff6b6b', type: 'cone' }, // 北 - 锥形
    { x: markerRadius, z: 0, color: '#4ecdc4', type: 'box' },  // 东 - 盒子
    { x: 0, z: markerRadius, color: '#45b7d1', type: 'ring' }, // 南 - 圆环
    { x: -markerRadius, z: 0, color: '#96ceb4', type: 'sphere' } // 西 - 球体
  ], [])

  return (
    <group>
      {directions.map((dir, index) => (
        <group key={index} position={[dir.x, 50, dir.z]}>
          {dir.type === 'cone' && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[20, 50, 16]} />
              <meshBasicMaterial color={dir.color} transparent opacity={0.8} />
            </mesh>
          )}
          {dir.type === 'box' && (
            <mesh>
              <boxGeometry args={[30, 30, 30]} />
              <meshBasicMaterial color={dir.color} transparent opacity={0.8} />
            </mesh>
          )}
          {dir.type === 'ring' && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[20, 5, 16, 32]} />
              <meshBasicMaterial color={dir.color} transparent opacity={0.8} />
            </mesh>
          )}
          {dir.type === 'sphere' && (
            <mesh>
              <sphereGeometry args={[20, 16, 16]} />
              <meshBasicMaterial color={dir.color} transparent opacity={0.8} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

// 天体运行轨迹预测
function CelestialTrajectory({ celestialBodies, observerPlanet, globalTime, observerPlanetWorldPos, latitude, longitude }: { 
  celestialBodies: CelestialBody[], 
  observerPlanet: CelestialBody,
  globalTime: number,
  observerPlanetWorldPos: THREE.Vector3,
  latitude: number,
  longitude: number
}) {
  const trajectories = useMemo(() => {
    const DAY_IN_SECONDS = 24.15 * 3600
    const YEAR_IN_DAYS = 426.15
    const YEAR_IN_SECONDS = YEAR_IN_DAYS * DAY_IN_SECONDS

    const result: { body: CelestialBody; points: THREE.Vector3[]; opacity: number }[] = []
    
    const basePeriod = YEAR_IN_SECONDS / Math.pow(observerPlanet.orbitalElements!.semiMajorAxis, 1.5)
    const observerAxialTilt = observerPlanet.axialTilt || 0.33
    
    celestialBodies.forEach(body => {
      // 跳过观测者自身
      if (body.id === observerPlanet.id) return
      
      const points: THREE.Vector3[] = []
      const numPoints = 80
      let trajectoryOpacity = 0.3
      
      if (body.type === 'star') {
        // === 太阳轨迹：采样一整年 ===
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const time = globalTime + t * YEAR_IN_SECONDS
          const planetPos = calculateOrbitalPositionScaled(time, observerPlanet.orbitalElements!, 1, basePeriod)
          const planetWorldPos = new THREE.Vector3(planetPos.x, planetPos.y, planetPos.z)
          const sunWorldPos = new THREE.Vector3(0, 0, 0)
          const planetRotationAngle = time * (2 * Math.PI / DAY_IN_SECONDS)
          
          const altAz = worldToSkyPosition(
            sunWorldPos, planetWorldPos,
            observerAxialTilt, planetRotationAngle,
            latitude, longitude, observerPlanet.radius
          )
          
          if (altAz.altitude < -0.1) continue
          const dir = altAzToDirection(altAz.altitude, altAz.azimuth)
          points.push(dir.clone().multiplyScalar(750))
        }
        trajectoryOpacity = 0.35
        
      } else if (body.parentId && body.type === 'moon') {
        // === 卫星轨迹：采样一个完整轨道周期 ===
        const orbitalPeriodDays = body.orbitalPeriodDays || 30
        const moonBasePeriod = (orbitalPeriodDays * DAY_IN_SECONDS) / Math.pow(body.orbitalElements!.semiMajorAxis, 1.5)
        
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const time = globalTime + t * orbitalPeriodDays * DAY_IN_SECONDS
          const satellitePos = calculateOrbitalPositionScaled(time, body.orbitalElements!, 1, moonBasePeriod)
          const worldPos = new THREE.Vector3(satellitePos.x, satellitePos.y, satellitePos.z).add(observerPlanetWorldPos)
          const planetRotationAngle = time * (2 * Math.PI / DAY_IN_SECONDS)
          
          const altAz = worldToSkyPosition(
            worldPos, observerPlanetWorldPos,
            observerAxialTilt, planetRotationAngle,
            latitude, longitude, observerPlanet.radius
          )
          
          if (altAz.altitude < -0.1) continue
          const dir = altAzToDirection(altAz.altitude, altAz.azimuth)
          points.push(dir.clone().multiplyScalar(750))
        }
        trajectoryOpacity = 0.25
        
      } else if (body.type === 'planet' && body.orbitalElements) {
        // === 外行星轨迹：采样一整年，展示在天球上的视运动路径 ===
        // 外行星视运动 = 行星本身轨道 + 观测者轨道运动的合成
        const outerBasePeriod = YEAR_IN_SECONDS / Math.pow(body.orbitalElements.semiMajorAxis, 1.5)
        
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const time = globalTime + t * YEAR_IN_SECONDS
          
          // 观测者行星位置
          const observerPos = calculateOrbitalPositionScaled(time, observerPlanet.orbitalElements!, 1, basePeriod)
          const observerWorldPos = new THREE.Vector3(observerPos.x, observerPos.y, observerPos.z)
          
          // 外行星位置
          const outerPos = calculateOrbitalPositionScaled(time, body.orbitalElements!, 1, outerBasePeriod)
          const outerWorldPos = new THREE.Vector3(outerPos.x, outerPos.y, outerPos.z)
          
          const planetRotationAngle = time * (2 * Math.PI / DAY_IN_SECONDS)
          
          const altAz = worldToSkyPosition(
            outerWorldPos, observerWorldPos,
            observerAxialTilt, planetRotationAngle,
            latitude, longitude, observerPlanet.radius
          )
          
          if (altAz.altitude < -0.1) continue
          const dir = altAzToDirection(altAz.altitude, altAz.azimuth)
          points.push(dir.clone().multiplyScalar(750))
        }
        trajectoryOpacity = 0.2
      }
      
      if (points.length > 1) {
        result.push({ body, points, opacity: trajectoryOpacity })
      }
    })
    
    return result
  }, [celestialBodies, observerPlanet, globalTime, observerPlanetWorldPos, latitude, longitude])

  return (
    <group>
      {trajectories.map((traj, idx) => (
        <line key={traj.body.id}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={traj.points.length}
              array={new Float32Array(traj.points.flatMap(p => [p.x, p.y, p.z]))}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={traj.body.color}
            transparent
            opacity={traj.opacity}
            linewidth={1}
          />
        </line>
      ))}
    </group>
  )
}

// 天空穹顶
function SkyDome({ sunDirection, sunAltitude, atmosphereColor }: {
  sunDirection: THREE.Vector3
  sunAltitude: number
  atmosphereColor: string
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    sunDirection: { value: new THREE.Vector3() },
    sunAltitude: { value: 0 },
    atmosphereColor: { value: new THREE.Color(atmosphereColor) }
  }), [])

  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.sunDirection.value.copy(sunDirection)
      materialRef.current.uniforms.sunAltitude.value = sunAltitude
    }
  })

  return (
    <mesh>
      <sphereGeometry args={[1000, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={skyDomeVertexShader}
        fragmentShader={skyDomeFragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// 太阳
function Sun({ direction, altitude, starRadius }: { direction: THREE.Vector3; altitude: number; starRadius: number }) {
  // 太阳高度角低于 -6° (0.105 rad) 时不渲染
  if (altitude < -0.105) return null

  const sunPosition = direction.clone().multiplyScalar(800)
  const glowScale = 1.0 + Math.max(0, -altitude) * 0.8
  const bodySize = starRadius * 4

  return (
    <Billboard position={sunPosition}>
      {/* 太阳本体 */}
      <mesh>
        <circleGeometry args={[bodySize, 32]} />
        <meshBasicMaterial
          color="#fffde0"
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* 内光晕 */}
      <mesh scale={glowScale * 0.8}>
        <circleGeometry args={[bodySize * 1.15, 32]} />
        <meshBasicMaterial
          color="#ffe8a0"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* 外光晕 */}
      <mesh scale={glowScale * 1.2}>
        <circleGeometry args={[bodySize * 1.45, 32]} />
        <meshBasicMaterial
          color="#ffcc66"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* 太阳名称 */}
      <Html center position={[0, bodySize * 1.6, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#ffe8a0', fontSize: '14px', fontWeight: 'bold', textShadow: '0 0 4px black' }}>太阳</div>
      </Html>
    </Billboard>
  )
}

// 地面 - 昼夜阴影
function Ground({ planet, sunDirection, sunAltitude }: { planet: CelestialBody; sunDirection: THREE.Vector3; sunAltitude: number }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  // 每帧更新 sunDirection 和 sunAltitude
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.sunDirection.value.copy(sunDirection)
      materialRef.current.uniforms.sunAltitude.value = sunAltitude
    }
  })

  const uniforms = useMemo(() => ({
    sunDirection: { value: sunDirection.clone() },
    sunAltitude: { value: sunAltitude },
    groundColor: { value: new THREE.Color(planet.color) }
  }), [planet.color])

  return (
    <mesh rotation={[-Math.PI / 2 + 0.02, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[200, 200, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={groundVertexShader}
        fragmentShader={groundFragmentShader}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// 大气辉光
function AtmosphereGlow({ sunDirection, show, atmosphereColor }: {
  sunDirection: THREE.Vector3
  show: boolean
  atmosphereColor: string
}) {
  if (!show) return null

  const glowPosition = sunDirection.clone().multiplyScalar(100)
  const glowRotation = useMemo(() => {
    const quaternion = new THREE.Quaternion()
    const target = glowPosition.clone()
    const eye = new THREE.Vector3(0, 0, 0)
    const up = new THREE.Vector3(0, 1, 0)
    const matrix = new THREE.Matrix4().lookAt(eye, target, up)
    quaternion.setFromRotationMatrix(matrix)
    return new THREE.Euler().setFromQuaternion(quaternion)
  }, [glowPosition.x, glowPosition.y, glowPosition.z])

  return (
    <group position={glowPosition} rotation={glowRotation}>
      {/* 大气散射锥体 */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[30, 60, 32, 1, true]} />
        <meshBasicMaterial
          color={atmosphereColor}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 散射平面 */}
      <mesh position={[0, -20, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial
          color={atmosphereColor}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

// 天体标记
function CelestialMarkers({
  celestialBodies,
  observerPlanet,
  globalTime,
  observerPlanetWorldPos,
  latitude,
  longitude,
  atmosphereRefraction,
  refractionCoefficient,
  markerSizeScale
}: {
  celestialBodies: CelestialBody[]
  observerPlanet: CelestialBody
  globalTime: number
  observerPlanetWorldPos: THREE.Vector3
  latitude: number
  longitude: number
  atmosphereRefraction: boolean
  refractionCoefficient: number
  markerSizeScale: number
}) {
  const markers = useMemo(() => {
    const DAY_IN_SECONDS = 24.15 * 3600
    const YEAR_IN_DAYS = 426.15
    const YEAR_IN_SECONDS = YEAR_IN_DAYS * DAY_IN_SECONDS

    const result: {
      position: THREE.Vector3
      color: string
      size: number
      name: string
      opacity: number
      glowOpacity: number
      glowScale: number
      bodyType: string
    }[] = []

    const basePeriod = YEAR_IN_SECONDS / Math.pow(observerPlanet.orbitalElements!.semiMajorAxis, 1.5)
    const planetRotationAngle = globalTime * (2 * Math.PI / DAY_IN_SECONDS)
    const observerAxialTilt = observerPlanet.axialTilt || 0.33

    // 太阳位置（用于计算相位角）
    const sunWorldPos = new THREE.Vector3(0, 0, 0)

    celestialBodies.forEach((body) => {
      // 过滤掉观测者自身和恒星
      if (body.id === observerPlanet.id) return
      if (body.type === 'star') return

      let worldPos: THREE.Vector3

      if (body.parentId === observerPlanet.id) {
        // === 卫星 ===
        const moonBasePeriod = (body.orbitalPeriodDays! * DAY_IN_SECONDS) / Math.pow(body.orbitalElements!.semiMajorAxis, 1.5)
        const satellitePos = calculateOrbitalPositionScaled(globalTime, body.orbitalElements!, 1, moonBasePeriod)
        worldPos = new THREE.Vector3(satellitePos.x, satellitePos.y, satellitePos.z).add(observerPlanetWorldPos)
      } else if (body.type === 'planet' && body.orbitalElements) {
        // === 外行星：使用独立轨道参数 ===
        const outerBasePeriod = YEAR_IN_SECONDS / Math.pow(body.orbitalElements.semiMajorAxis, 1.5)
        const pos = calculateOrbitalPositionScaled(globalTime, body.orbitalElements!, 1, outerBasePeriod)
        worldPos = new THREE.Vector3(pos.x, pos.y, pos.z)
      } else {
        return
      }

      const { altitude, azimuth } = worldToSkyPosition(
        worldPos,
        observerPlanetWorldPos,
        observerAxialTilt,
        planetRotationAngle,
        latitude,
        longitude,
        observerPlanet.radius
      )

      // 过滤掉地平线以下的天体
      if (altitude < -0.1) return

      // 应用大气折射修正
      const correctedAltitude = atmosphereRefraction
        ? applyAtmosphericRefraction(altitude, refractionCoefficient)
        : altitude

      const skyDir = altAzToDirection(correctedAltitude, azimuth)
      const skyPosition = skyDir.multiplyScalar(800)

      // === 计算距离相关的视觉属性 ===
      const distanceToObserver = worldPos.distanceTo(observerPlanetWorldPos)
      
      let baseSize: number
      let opacity: number
      let glowOpacity: number
      let glowScale: number
      let displayColor: string

      // === 统一视大小：apparentSize ∝ radius / distance ===
      // K=80 校准点：大卫星 (radius=0.75, dist≈6.0) → 视觉大小 10
      const apparentSize = (body.radius / distanceToObserver) * 80

      if (body.parentId === observerPlanet.id) {
        // 卫星：近距离，较大较亮
        baseSize = Math.max(2.5, Math.min(apparentSize, 14))
        opacity = 0.95
        glowOpacity = 0.4
        glowScale = 2.5
        displayColor = '#e8e8e8'
      } else {
        // === 外行星：距离相关渲染 ===
        baseSize = Math.max(2.5, Math.min(apparentSize, 15))
        
        // 计算相位角：太阳-观测者-行星 之间的角度
        // cos(phaseAngle) = (sunDir · planetDir)，其中 sunDir = normalize(sunPos - observerPos)
        const sunDir = sunWorldPos.clone().sub(observerPlanetWorldPos).normalize()
        const planetDir = worldPos.clone().sub(observerPlanetWorldPos).normalize()
        const phaseCos = sunDir.dot(planetDir)
        // 外行星从内行星看：相位角小，几乎全相（phaseCos ≈ 1 为冲日，最亮）
        // phaseCos ≈ 0 为合日，最暗但不可见（在太阳方向）
        const phaseFactor = 0.5 + 0.5 * Math.max(0, phaseCos)
        
        // 距离衰减：亮度 ∝ 1/distance²
        // 取最小距离（冲日时）为 distance_opposition = a_outer - a_observer
        const minDist = body.orbitalElements!.semiMajorAxis - observerPlanet.orbitalElements!.semiMajorAxis
        const distanceFactor = Math.pow(minDist / distanceToObserver, 2)
        
        // 综合亮度
        const brightness = phaseFactor * distanceFactor
        
        opacity = 0.5 + brightness * 0.45
        glowOpacity = 0.1 + brightness * 0.3
        glowScale = 1.5 + brightness * 1.5
        displayColor = body.color
      }

      const size = baseSize * markerSizeScale

      result.push({
        position: skyPosition,
        color: displayColor,
        size,
        name: body.name,
        opacity,
        glowOpacity,
        glowScale,
        bodyType: body.type
      })
    })

    return result
  }, [celestialBodies, observerPlanet, globalTime, observerPlanetWorldPos, latitude, longitude, atmosphereRefraction, refractionCoefficient, markerSizeScale])

  return (
    <>
      {markers.map((marker, index) => (
        <Billboard key={index} position={marker.position}>
          {/* 发光本体 */}
          <mesh>
            <circleGeometry args={[marker.size, 16]} />
            <meshBasicMaterial
              color={marker.color}
              side={THREE.DoubleSide}
              transparent
              opacity={marker.opacity}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          {/* 光晕 */}
          <mesh scale={marker.glowScale}>
            <circleGeometry args={[marker.size, 16]} />
            <meshBasicMaterial
              color={marker.color}
              side={THREE.DoubleSide}
              transparent
              opacity={marker.glowOpacity}
              depthTest={false}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* 名称标注 */}
          <Html center position={[0, marker.size + 5, 0]} style={{ pointerEvents: 'none' }}>
            <div style={{ color: 'white', fontSize: '11px', textShadow: '0 0 3px black' }}>{marker.name}</div>
          </Html>
        </Billboard>
      ))}
    </>
  )
}

// 行星环弧形投影 - 从地表看到的行星环
function PlanetRingArc({ observerPlanet, latitude }: { observerPlanet: CelestialBody, latitude: number }) {
  if (!observerPlanet.hasRing) return null

  const ringColor = observerPlanet.ringColor || '#aabbcc'
  const axialTilt = observerPlanet.axialTilt || 0.41
  
  // 环在赤道平面上，从地表看是一个大圆
  // 环面法线方向 = 行星自转轴方向
  // 从观测者纬度看，环面倾斜角 = 90° - 纬度 + 轴倾角 * cos(年进度)
  const ringTilt = Math.PI / 2 - latitude + axialTilt
  const ringRadius = 600

  return (
    <group>
      {/* 主环 */}
      <mesh rotation={[ringTilt, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[ringRadius * 0.85, ringRadius, 128, 1]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 外环 */}
      <mesh rotation={[ringTilt, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[ringRadius, ringRadius * 1.1, 128, 1]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 内环 */}
      <mesh rotation={[ringTilt, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[ringRadius * 0.7, ringRadius * 0.85, 128, 1]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// 相机控制器
function CameraController({
  fov,
  yawRef,
  pitchRef
}: {
  fov: number
  yawRef: React.MutableRefObject<number>
  pitchRef: React.MutableRefObject<number>
}) {
  const { camera } = useThree()

  useFrame(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    // 应用旋转：先绕Y轴（yaw），再绕X轴（pitch）
    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(euler)
  })

  return null
}

// 场景内容
function SurfaceViewScene({
  planet,
  dayTime,
  yearProgress,
  globalTime,
  latitude,
  longitude,
  fov,
  showAtmosphere,
  atmosphereColor,
  celestialBodies,
  yawRef,
  pitchRef,
  atmosphereRefraction,
  refractionCoefficient,
  markerSizeScale,
  showConstellations,
  constellationLineWidth,
  showEcliptic,
  eclipticLineWidth,
  showHorizon
}: {
  planet: CelestialBody
  dayTime: number
  yearProgress: number
  globalTime: number
  latitude: number
  longitude: number
  fov: number
  showAtmosphere: boolean
  atmosphereColor: string
  celestialBodies: CelestialBody[]
  yawRef: React.MutableRefObject<number>
  pitchRef: React.MutableRefObject<number>
  atmosphereRefraction: boolean
  refractionCoefficient: number
  markerSizeScale: number
  showConstellations: boolean
  constellationLineWidth: number
  showEcliptic: boolean
  eclipticLineWidth: number
  showHorizon: boolean
}) {
  const axialTilt = planet.axialTilt || 0.41

  // 计算观测行星的世界坐标（使用 globalTime）
  const DAY_IN_SECONDS = 24.15 * 3600
  const YEAR_IN_DAYS = 426.15
  const YEAR_IN_SECONDS = YEAR_IN_DAYS * DAY_IN_SECONDS
  const observerPlanetWorldPos = useMemo(() => {
    const basePeriod = YEAR_IN_SECONDS / Math.pow(planet.orbitalElements!.semiMajorAxis, 1.5)
    const pos = calculateOrbitalPositionScaled(globalTime, planet.orbitalElements!, 1, basePeriod)
    return new THREE.Vector3(pos.x, pos.y, pos.z)
  }, [globalTime, planet.orbitalElements])

  // 计算太阳在天空中的位置（基于真实轨道位置）
  // 太阳位于原点 (0,0,0)，从观测行星看太阳的方向 = -observerPlanetWorldPos
  const sunWorldPos = useMemo(() => new THREE.Vector3(0, 0, 0), [])
  const planetRotationAngle = globalTime * (2 * Math.PI / DAY_IN_SECONDS)
  const sunSkyPos = useMemo(() => {
    return worldToSkyPosition(
      sunWorldPos,
      observerPlanetWorldPos,
      axialTilt,
      planetRotationAngle,
      latitude,
      longitude,
      planet.radius
    )
  }, [sunWorldPos, observerPlanetWorldPos, axialTilt, planetRotationAngle, latitude, longitude, planet.radius])
  
  // 应用大气折射修正
  const correctedAltitude = atmosphereRefraction 
    ? applyAtmosphericRefraction(sunSkyPos.altitude, refractionCoefficient)
    : sunSkyPos.altitude
  const sunDirection = altAzToDirection(correctedAltitude, sunSkyPos.azimuth)
  
  // 为清晰起见，将修正后的高度角赋值给新变量
  const sunAltitude = correctedAltitude

  // 昼夜因子：白天 1，夜晚 0
  const nightThreshold = -0.105
  const dayThreshold = 0.105
  const dayFactor = Math.max(0, Math.min(1, (sunAltitude - nightThreshold) / (dayThreshold - nightThreshold)))

  return (
    <>
      <CameraController fov={fov} yawRef={yawRef} pitchRef={pitchRef} />

      {/* 环境光：夜间降低 */}
      <ambientLight intensity={0.05 + dayFactor * 0.35} />


      {/* 太阳光 */}
      <directionalLight
        position={sunDirection.clone().multiplyScalar(100)}
        intensity={Math.max(0.05, Math.sin(sunAltitude)) * 4 * dayFactor}
        color="#fffde0"
      />

      {/* 天空穹顶 */}
      <SkyDome
        sunDirection={sunDirection}
        sunAltitude={sunAltitude}
        atmosphereColor={atmosphereColor}
      />

      {/* 星空 */}
      <StarField sunAltitude={sunAltitude} />
      
      {/* 星座连线 */}
      {showConstellations && (
        <ConstellationLines lineWidth={constellationLineWidth} />
      )}
      
      {/* 黄道线 */}
      {showEcliptic && (
        <EclipticLine lineWidth={eclipticLineWidth} axialTilt={axialTilt} />
      )}
      
      {/* 地平线 */}
      {showHorizon && (
        <HorizonCircle />
      )}

      {/* 方向标识 */}
      <DirectionMarkers />

      {/* 天体运行轨迹 */}
      <CelestialTrajectory 
        celestialBodies={celestialBodies} 
        observerPlanet={planet}
        globalTime={globalTime}
        observerPlanetWorldPos={observerPlanetWorldPos}
        latitude={latitude}
        longitude={longitude}
      />

      {/* 太阳 */}
      <Sun direction={sunDirection} altitude={sunAltitude} starRadius={celestialBodies.find(b => b.type === 'star')?.radius ?? 8.0} />

      {/* 天体标记 */}
      <CelestialMarkers
        celestialBodies={celestialBodies}
        observerPlanet={planet}
        globalTime={globalTime}
        observerPlanetWorldPos={observerPlanetWorldPos}
        latitude={latitude}
        longitude={longitude}
        atmosphereRefraction={atmosphereRefraction}
        refractionCoefficient={refractionCoefficient}
        markerSizeScale={markerSizeScale}
      />

      {/* 行星环弧形投影 */}
      <PlanetRingArc observerPlanet={planet} latitude={latitude} />

      {/* 地面 */}
      <Ground planet={planet} sunDirection={sunDirection} sunAltitude={sunAltitude} />

      {/* 大气辉光 */}
      <AtmosphereGlow
        sunDirection={sunDirection}
        show={showAtmosphere}
        atmosphereColor={atmosphereColor}
      />
    </>
  )
}

// 主组件
const SurfaceView = forwardRef<SurfaceViewHandle, SurfaceViewProps>(({
  planet,
  dayTime,
  yearProgress,
  globalTime,
  latitude,
  longitude,
  fov,
  onFovChange,
  celestialBodies,
  showAtmosphere,
  atmosphereColor,
  atmosphereRefraction,
  refractionCoefficient,
  markerSizeScale,
  showConstellations,
  constellationLineWidth,
  showEcliptic,
  eclipticLineWidth,
  showHorizon
}, ref) => {
  const yawRef = useRef(0)
  const pitchRef = useRef(0)

  useImperativeHandle(ref, () => ({
    setYawPitch: (yaw: number, pitch: number) => {
      yawRef.current = yaw
      pitchRef.current = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
    }
  }))

  return (
    <Canvas
      camera={{ position: [0, 0.1, 0], fov, near: 0.01, far: 2000 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance'
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <SurfaceViewScene
        planet={planet}
        dayTime={dayTime}
        yearProgress={yearProgress}
        globalTime={globalTime}
        latitude={latitude}
        longitude={longitude}
        fov={fov}
        showAtmosphere={showAtmosphere}
        atmosphereColor={atmosphereColor}
        celestialBodies={celestialBodies}
        yawRef={yawRef}
        pitchRef={pitchRef}
        atmosphereRefraction={atmosphereRefraction}
        refractionCoefficient={refractionCoefficient}
        markerSizeScale={markerSizeScale}
        showConstellations={showConstellations}
        constellationLineWidth={constellationLineWidth}
        showEcliptic={showEcliptic}
        eclipticLineWidth={eclipticLineWidth}
        showHorizon={showHorizon}
      />
    </Canvas>
  )
})

SurfaceView.displayName = 'SurfaceView'

export default SurfaceView

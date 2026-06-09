import { useRef, useMemo, useImperativeHandle, forwardRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html } from '@react-three/drei'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { applyAtmosphericRefraction, worldToSkyPosition } from '../utils/surfaceCoords'
import { sunEclipticHigh, eclipticToEquatorial, equatorialToHorizontal, calcLST, buildENUBasis } from '../utils/astronomy'
import { useStore } from '../store'
import { SECONDS_PER_DAY, D_YEAR } from '../config/constants'
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

// 天体运行轨迹预测（局部坐标版）- 在 Group 内使用局部 ENU 坐标
function CelestialTrajectoryLocal({ celestialBodies, observerPlanet, globalTime, observerPlanetWorldPos, latitude, longitude, enuBasis }: { 
  celestialBodies: CelestialBody[], 
  observerPlanet: CelestialBody,
  globalTime: number,
  observerPlanetWorldPos: THREE.Vector3,
  latitude: number,
  longitude: number,
  enuBasis: { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3; position: THREE.Vector3 }
}) {
  const trajectories = useMemo(() => {
    const result: { body: CelestialBody; points: THREE.Vector3[]; opacity: number }[] = []
    
    const basePeriod = D_YEAR / Math.pow(observerPlanet.orbitalElements!.semiMajorAxis, 1.5)
    const observerAxialTilt = observerPlanet.axialTilt || 0.33
    
    // 局部坐标转换辅助函数
    const horizontalToLocal = (h: number, A: number) => {
      const cosH = Math.cos(h)
      const sinH = Math.sin(h)
      const cosA = Math.cos(A)
      const sinA = Math.sin(A)
      return new THREE.Vector3(cosH * sinA, sinH, cosH * cosA)
    }
    
    celestialBodies.forEach(body => {
      // 跳过观测者自身
      if (body.id === observerPlanet.id) return
      
      const points: THREE.Vector3[] = []
      const numPoints = 80
      let trajectoryOpacity = 0.3
      
      if (body.type === 'star') {
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const time = globalTime + t * D_YEAR
          const planetPos = calculateOrbitalPositionScaled(time, observerPlanet.orbitalElements!, 1, basePeriod)
          const planetWorldPos = new THREE.Vector3(planetPos.x, planetPos.y, planetPos.z)
          const sunWorldPos = new THREE.Vector3(0, 0, 0)
          const planetRotationAngle = time * (2 * Math.PI)
          
          const altAz = worldToSkyPosition(
            sunWorldPos, planetWorldPos,
            observerAxialTilt, planetRotationAngle,
            latitude, longitude, observerPlanet.radius
          )
          
          if (altAz.altitude < -0.1) continue
          const dir = horizontalToLocal(altAz.altitude, altAz.azimuth)
          points.push(dir.clone().multiplyScalar(750))
        }
        trajectoryOpacity = 0.35
        
      } else if (body.parentId && body.type === 'moon') {
        const orbitalPeriodDays = body.orbitalPeriodDays || 30
        const moonBasePeriod = orbitalPeriodDays / Math.pow(body.orbitalElements!.semiMajorAxis, 1.5)
        
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const time = globalTime + t * orbitalPeriodDays
          const satellitePos = calculateOrbitalPositionScaled(time, body.orbitalElements!, 1, moonBasePeriod)
          const worldPos = new THREE.Vector3(satellitePos.x, satellitePos.y, satellitePos.z).add(observerPlanetWorldPos)
          const planetRotationAngle = time * (2 * Math.PI)
          
          const altAz = worldToSkyPosition(
            worldPos, observerPlanetWorldPos,
            observerAxialTilt, planetRotationAngle,
            latitude, longitude, observerPlanet.radius
          )
          
          if (altAz.altitude < -0.1) continue
          const dir = horizontalToLocal(altAz.altitude, altAz.azimuth)
          points.push(dir.clone().multiplyScalar(750))
        }
        trajectoryOpacity = 0.25
        
      } else if (body.type === 'planet' && body.orbitalElements) {
        const outerBasePeriod = D_YEAR / Math.pow(body.orbitalElements.semiMajorAxis, 1.5)
        
        for (let i = 0; i <= numPoints; i++) {
          const t = i / numPoints
          const time = globalTime + t * D_YEAR
          
          const observerPos = calculateOrbitalPositionScaled(time, observerPlanet.orbitalElements!, 1, basePeriod)
          const observerWorldPos = new THREE.Vector3(observerPos.x, observerPos.y, observerPos.z)
          
          const outerPos = calculateOrbitalPositionScaled(time, body.orbitalElements!, 1, outerBasePeriod)
          const outerWorldPos = new THREE.Vector3(outerPos.x, outerPos.y, outerPos.z)
          
          const planetRotationAngle = time * (2 * Math.PI)
          
          const altAz = worldToSkyPosition(
            outerWorldPos, observerWorldPos,
            observerAxialTilt, planetRotationAngle,
            latitude, longitude, observerPlanet.radius
          )
          
          if (altAz.altitude < -0.1) continue
          const dir = horizontalToLocal(altAz.altitude, altAz.azimuth)
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

// 天空穹顶着色器
const skyDomeVertexShader = `
  varying vec3 vLocalPos;
  varying vec3 vWorldPosition;

  void main() {
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyDomeFragmentShader = `
  uniform vec3 sunDirection;
  uniform float sunAltitude;
  uniform vec3 atmosphereColor;
  uniform vec3 enuUp;

  varying vec3 vLocalPos;
  varying vec3 vWorldPosition;

  void main() {
    // 使用局部ENU坐标（SkyDome顶点在局部空间即方向向量）
    vec3 localDir = normalize(vLocalPos);
    
    // 天顶方向：点乘 enuUp = 真实天顶分量
    float zenithDot = max(dot(localDir, normalize(enuUp)), 0.0);

    // 地平线附近
    float horizonFactor = 1.0 - zenithDot;

    // 太阳方向（局部 ENU 坐标）
    float sunDot = max(dot(localDir, normalize(sunDirection)), 0.0);

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
  varying vec3 vLocalPos;
  varying vec3 vWorldPosition;

  void main() {
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const groundFragmentShader = `
  uniform vec3 sunDirection;
  uniform float sunAltitude;
  uniform vec3 groundColor;
  varying vec3 vLocalPos;
  varying vec3 vWorldPosition;

  void main() {
    vec3 baseGroundColor = groundColor;

    // 太阳在水平面上的投影（局部坐标 XZ 平面 = 切平面）
    vec2 sunHoriz = vec2(sunDirection.x, sunDirection.z);
    float sunHorizLen = length(sunHoriz);
    vec2 sunDir2D = sunHorizLen < 0.001 ? vec2(1.0, 0.0) : sunHoriz / sunHorizLen;
    
    // 当前像素在切平面上的方向（局部坐标 XZ）
    vec2 posDir2D = normalize(vec2(vLocalPos.x, vLocalPos.z));
    
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
    vec3 dayColor = baseGroundColor * 0.85;
    vec3 nightColor = baseGroundColor * 0.02;
    
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

// 黄道线（太阳年运行轨迹在天球上的投影）
function EclipticLine({ lineWidth, axialTilt, sunDirection }: { lineWidth: number; axialTilt: number; sunDirection: THREE.Vector3 }) {
  const points = useMemo(() => {
    const count = 100
    const positions = []
    
    // 轨道面法线：行星轨道面绕 X 轴倾斜 axialTilt（与 worldToSkyPosition 一致）
    const cosTilt = Math.cos(axialTilt)
    const sinTilt = Math.sin(axialTilt)
    const orbitNormal = new THREE.Vector3(0, cosTilt, sinTilt).normalize()
    
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2
      const point = sunDirection.clone()
        .applyAxisAngle(orbitNormal, angle)
        .multiplyScalar(800)
      positions.push(point)
    }
    
    return positions
  }, [axialTilt, sunDirection])

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

// 黄道线（局部坐标版）- 在 Group 内使用局部 ENU 坐标计算
function EclipticLineLocal({ lineWidth, axialTilt, sunDirLocal, enuBasis }: {
  lineWidth: number; axialTilt: number; sunDirLocal: THREE.Vector3; enuBasis: { east: THREE.Vector3; up: THREE.Vector3; north: THREE.Vector3 }
}) {
  const points = useMemo(() => {
    const count = 100
    const positions = []
    
    // 轨道面法线在行星本地世界空间 = (0, cosTilt, sinTilt)
    // 需要投影到 ENU 局部坐标基 (east, up, north)
    const orbitNormalWorld = new THREE.Vector3(0, Math.cos(axialTilt), Math.sin(axialTilt))
    const orbitNormalLocal = new THREE.Vector3(
      orbitNormalWorld.dot(enuBasis.east),
      orbitNormalWorld.dot(enuBasis.up),
      orbitNormalWorld.dot(enuBasis.north)
    ).normalize()
    
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2
      const point = sunDirLocal.clone()
        .applyAxisAngle(orbitNormalLocal, angle)
        .multiplyScalar(800)
      positions.push(point)
    }
    
    return positions
  }, [axialTilt, sunDirLocal])

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
      <lineBasicMaterial color="#ffcc00" linewidth={lineWidth} transparent opacity={0.8} />
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

// 方向标识（东、西、南、北）- 在局部 ENU 坐标中，带 Html 标签
function DirectionMarkers() {
  const markerRadius = 700
  const labelOffset = 60     // 标签在几何体上方的偏移量
  const markerOpacity = 0.9

  // 局部 ENU 坐标：X=东, Y=天顶, Z=北
  const directions = useMemo(() => [
    { pos: new THREE.Vector3(0, 0, +markerRadius), color: '#ff4444', name: '北 (North)', geoType: 'cone', rotate: [Math.PI / 2, 0, 0] },
    { pos: new THREE.Vector3(+markerRadius, 0, 0),  color: '#44dd44', name: '东 (East)',  geoType: 'box', rotate: [0, 0, 0] },
    { pos: new THREE.Vector3(0, 0, -markerRadius), color: '#4488ff', name: '南 (South)', geoType: 'ring', rotate: [Math.PI / 2, 0, 0] },
    { pos: new THREE.Vector3(-markerRadius, 0, 0),  color: '#dddd44', name: '西 (West)',  geoType: 'sphere', rotate: [0, 0, 0] },
  ], [])

  return (
    <group>
      {directions.map((dir, index) => (
        <group key={index} position={[dir.pos.x, dir.pos.y, dir.pos.z]}>
          {/* 几何体标记 */}
          <mesh rotation={dir.rotate as [number, number, number]}>
            {dir.geoType === 'cone' && <coneGeometry args={[18, 45, 16]} />}
            {dir.geoType === 'box' && <boxGeometry args={[28, 28, 28]} />}
            {dir.geoType === 'ring' && <torusGeometry args={[18, 5, 16, 32]} />}
            {dir.geoType === 'sphere' && <sphereGeometry args={[18, 16, 16]} />}
            <meshBasicMaterial color={dir.color} transparent opacity={markerOpacity} />
          </mesh>
          {/* Html 文字标签：置于几何体上方 */}
          <Html position={[0, labelOffset, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              color: dir.color,
              fontSize: 14,
              fontWeight: 'bold',
              textShadow: '0 0 8px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}>
              {dir.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}

// 天空穹顶
function SkyDome({ sunDirection, sunAltitude, atmosphereColor, observerPos, enuUp }: {
  sunDirection: THREE.Vector3
  sunAltitude: number
  atmosphereColor: string
  observerPos: THREE.Vector3
  enuUp: THREE.Vector3
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    sunDirection: { value: new THREE.Vector3() },
    sunAltitude: { value: 0 },
    atmosphereColor: { value: new THREE.Color(atmosphereColor) },
    enuUp: { value: new THREE.Vector3() }
  }), [])

  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.sunDirection.value.copy(sunDirection)
      materialRef.current.uniforms.sunAltitude.value = sunAltitude
      materialRef.current.uniforms.enuUp.value.copy(enuUp)
    }
  })

  return (
    <mesh position={observerPos}>
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
  const glowScale = 1.0 + Math.max(0, -altitude) * 0.4
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
      <mesh scale={glowScale * 0.4}>
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
      <mesh scale={glowScale * 0.7}>
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
function Ground({ planet, sunDirection, sunAltitude, observerLat, observerLon }: {
  planet: CelestialBody
  sunDirection: THREE.Vector3
  sunAltitude: number
  observerLat: number
  observerLon: number
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const [sampledColor, setSampledColor] = useState<string>(planet.color)
  const lastSampledRef = useRef<{ lat: number; lon: number } | null>(null)

  // 根据观测点经纬度从地图贴图采样单像素颜色
  useEffect(() => {
    // 经纬度变化小于 0.001 弧度 (~0.06°) 时不重新采样
    if (lastSampledRef.current &&
      Math.abs(lastSampledRef.current.lat - observerLat) < 0.001 &&
      Math.abs(lastSampledRef.current.lon - observerLon) < 0.001) {
      return
    }
    lastSampledRef.current = { lat: observerLat, lon: observerLon }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = import.meta.env.BASE_URL + 'map.jpg'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)

      // 等距矩形投影：lat ∈ [-π/2, π/2] → y ∈ [height, 0]; lon ∈ [-π, π] → x ∈ [0, width]
      const u = ((observerLon + Math.PI) / (2 * Math.PI)) * canvas.width
      const v = (1 - (observerLat + Math.PI / 2) / Math.PI) * canvas.height
      const px = Math.round(Math.max(0, Math.min(canvas.width - 1, u)))
      const py = Math.round(Math.max(0, Math.min(canvas.height - 1, v)))

      try {
        const pixel = ctx.getImageData(px, py, 1, 1).data
        const hex = '#' + [pixel[0], pixel[1], pixel[2]]
          .map(c => c.toString(16).padStart(2, '0')).join('')
        setSampledColor(hex)
      } catch {
        // 跨域时回退默认颜色
      }
    }
    img.onerror = () => {
      setSampledColor(planet.color)
    }
  }, [observerLat, observerLon, planet.color])

  const uniforms = useMemo(() => ({
    sunDirection: { value: sunDirection.clone() },
    sunAltitude: { value: sunAltitude },
    groundColor: { value: new THREE.Color(sampledColor) },
  }), [])

  // 采样颜色变化时更新 uniform
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.groundColor.value.set(sampledColor)
    }
  }, [sampledColor])

  // 每帧更新太阳方向
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.sunDirection.value.copy(sunDirection)
      materialRef.current.uniforms.sunAltitude.value = sunAltitude
    }
  })

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
function AtmosphereGlow({ sunDirection, show, atmosphereColor, observerPos, enuUp }: {
  sunDirection: THREE.Vector3
  show: boolean
  atmosphereColor: string
  observerPos: THREE.Vector3
  enuUp: THREE.Vector3
}) {
  if (!show) return null

  const glowPosition = sunDirection.clone().multiplyScalar(100)
  const glowRotation = useMemo(() => {
    const quaternion = new THREE.Quaternion()
    const target = glowPosition.clone().add(observerPos)
    const eye = observerPos.clone()
    const up = enuUp.clone()
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

// 天体标记（局部坐标版）- 在 Group 内使用局部 ENU 坐标
function CelestialMarkersLocal({
  celestialBodies,
  observerPlanet,
  globalTime,
  observerPlanetWorldPos,
  latitude,
  longitude,
  atmosphereRefraction,
  refractionCoefficient,
  markerSizeScale,
  enuBasis
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
  enuBasis: { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3; position: THREE.Vector3 }
}) {
  const markers = useMemo(() => {
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

    const basePeriod = D_YEAR / Math.pow(observerPlanet.orbitalElements!.semiMajorAxis, 1.5)
    const planetRotationAngle = globalTime * (2 * Math.PI)
    const observerAxialTilt = observerPlanet.axialTilt || 0.33

    // 局部坐标转换辅助函数
    const horizontalToLocal = (h: number, A: number) => {
      const cosH = Math.cos(h)
      const sinH = Math.sin(h)
      const cosA = Math.cos(A)
      const sinA = Math.sin(A)
      return new THREE.Vector3(cosH * sinA, sinH, cosH * cosA)
    }

    // 太阳位置（用于计算相位角）
    const sunWorldPos = new THREE.Vector3(0, 0, 0)

    celestialBodies.forEach((body) => {
      // 过滤掉观测者自身和恒星
      if (body.id === observerPlanet.id) return
      if (body.type === 'star') return

      let worldPos: THREE.Vector3

      if (body.parentId === observerPlanet.id) {
        // === 卫星 ===
        const moonBasePeriod = body.orbitalPeriodDays! / Math.pow(body.orbitalElements!.semiMajorAxis, 1.5)
        const satellitePos = calculateOrbitalPositionScaled(globalTime, body.orbitalElements!, 1, moonBasePeriod)
        worldPos = new THREE.Vector3(satellitePos.x, satellitePos.y, satellitePos.z).add(observerPlanetWorldPos)
      } else if (body.type === 'planet' && body.orbitalElements) {
        // === 外行星：使用独立轨道参数 ===
        const outerBasePeriod = D_YEAR / Math.pow(body.orbitalElements.semiMajorAxis, 1.5)
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

      const skyDir = horizontalToLocal(correctedAltitude, azimuth)
      const skyPosition = skyDir.multiplyScalar(800)

      // === 计算距离相关的视觉属性 ===
      const distanceToObserver = worldPos.distanceTo(observerPlanetWorldPos)
      
      let baseSize: number
      let opacity: number
      let glowOpacity: number
      let glowScale: number
      let displayColor: string

      const apparentSize = (body.radius / distanceToObserver) * 80

      if (body.parentId === observerPlanet.id) {
        baseSize = Math.max(2.5, Math.min(apparentSize, 14))
        opacity = 0.95
        glowOpacity = 0.4
        glowScale = 2.5
        displayColor = '#e8e8e8'
      } else {
        baseSize = Math.max(2.5, Math.min(apparentSize, 15))
        
        const sunDir = sunWorldPos.clone().sub(observerPlanetWorldPos).normalize()
        const planetDir = worldPos.clone().sub(observerPlanetWorldPos).normalize()
        const phaseCos = sunDir.dot(planetDir)
        const phaseFactor = 0.5 + 0.5 * Math.max(0, phaseCos)
        
        const minDist = body.orbitalElements!.semiMajorAxis - observerPlanet.orbitalElements!.semiMajorAxis
        const distanceFactor = Math.pow(minDist / distanceToObserver, 2)
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

// 相机控制器 - 使用 ENU 旋转轴，球面切平面视角
function CameraController({
  fov,
  yawRef,
  pitchRef,
  enuUp,
  enuEast,
  enuNorth,
  observerPos
}: {
  fov: number
  yawRef: React.MutableRefObject<number>
  pitchRef: React.MutableRefObject<number>
  enuUp: THREE.Vector3
  enuEast: THREE.Vector3
  enuNorth: THREE.Vector3
  observerPos: THREE.Vector3
}) {
  const { camera } = useThree()

  useFrame(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    // 相机位置：观察者上方
    const eyeHeight = 0.1
    camera.position.copy(observerPos).addScaledVector(enuUp, eyeHeight)

    // 相机 up 方向 = 天顶（始终垂直于切平面）
    camera.up.copy(enuUp)

    // 默认朝向：平视北方（沿切平面水平）
    let lookDir = enuNorth.clone().normalize()

    // yaw：绕天顶轴旋转（左右，始终平行于切平面）
    lookDir.applyAxisAngle(enuUp, yawRef.current)

    // pitch：绕相机当前的 east 轴旋转（上下，始终垂直于切平面）
    const currentEast = enuEast.clone().applyAxisAngle(enuUp, yawRef.current)
    lookDir.applyAxisAngle(currentEast, pitchRef.current)

    // 设置相机看向计算出的方向
    camera.lookAt(camera.position.clone().add(lookDir))
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
  const observerPlanetWorldPos = useMemo(() => {
    const basePeriod = D_YEAR / Math.pow(planet.orbitalElements!.semiMajorAxis, 1.5)
    const pos = calculateOrbitalPositionScaled(globalTime, planet.orbitalElements!, 1, basePeriod)
    return new THREE.Vector3(pos.x, pos.y, pos.z)
  }, [globalTime, planet.orbitalElements])

  // 使用 astronomy 模块计算太阳地平位置
  const timeSystem = useStore(s => s.timeSystem)
  const T = timeSystem.T
  const [sunAltAstro, sunAzAstro] = useMemo(() => {
    const [sunLon, epsPrime] = sunEclipticHigh(T)
    const [sunRA, sunDec] = eclipticToEquatorial(sunLon, 0, epsPrime)
    const lst = calcLST(T, longitude)
    return equatorialToHorizontal(sunRA, sunDec, lst, latitude)
  }, [T, longitude, latitude])

  const planetRotationAngle = globalTime * (2 * Math.PI)

  // 构建 ENU 局部坐标系基向量（使用共享函数）
  const enuBasis = useMemo(() => {
    return buildENUBasis(latitude, longitude, planetRotationAngle, axialTilt, planet.radius)
  }, [latitude, longitude, planetRotationAngle, axialTilt, planet.radius])

  // 将 ENU 基向量旋转到视觉场景坐标系（天顶=+Y, 东=+X, 北=+Z）
  // 不再使用 visualBasis 和 visualHorizontalToWorldDir
  // 所有局部对象放在 Group 内使用局部 ENU 坐标

  // 球面切平面 Group 的 world 矩阵
  // 将局部 ENU 坐标 (X=东, Y=天顶, Z=北) 映射到行星本地世界空间
  const surfaceGroupMatrix = useMemo(() => {
    const m = new THREE.Matrix4()
    m.makeBasis(enuBasis.east, enuBasis.up, enuBasis.north)
    m.setPosition(enuBasis.position.x, enuBasis.position.y, enuBasis.position.z)
    return m
  }, [enuBasis])

  // 应用大气折射修正
  const correctedAltitude = atmosphereRefraction 
    ? applyAtmosphericRefraction(sunAltAstro, refractionCoefficient)
    : sunAltAstro

  // 在局部 ENU 坐标中计算太阳方向（X=东, Y=天顶, Z=北）
  const sunDirLocal = useMemo(() => {
    const cosH = Math.cos(correctedAltitude)
    const sinH = Math.sin(correctedAltitude)
    const cosA = Math.cos(sunAzAstro)
    const sinA = Math.sin(sunAzAstro)
    // A=0 → 北: dir=(0, 0, cosH) = +Z
    // A=π/2 → 东: dir=(cosH, 0, 0) = +X
    // h=π/2 → 天顶: dir=(0, 1, 0) = +Y
    return new THREE.Vector3(cosH * sinA, sinH, cosH * cosA)
  }, [correctedAltitude, sunAzAstro])

  // 世界空间太阳方向（用于 DirectionalLight、SkyDome 等 Group 外部对象）
  const sunDirWorld = useMemo(() => {
    // 将局部方向转换到世界空间
    return new THREE.Vector3()
      .addScaledVector(enuBasis.east, sunDirLocal.x)
      .addScaledVector(enuBasis.up, sunDirLocal.y)
      .addScaledVector(enuBasis.north, sunDirLocal.z)
  }, [sunDirLocal, enuBasis])

  const sunAltitude = correctedAltitude

  // 昼夜因子：白天 1，夜晚 0
  const nightThreshold = -0.105
  const dayThreshold = 0.105
  const dayFactor = Math.max(0, Math.min(1, (sunAltitude - nightThreshold) / (dayThreshold - nightThreshold)))

  return (
    <>
      <CameraController fov={fov} yawRef={yawRef} pitchRef={pitchRef} enuUp={enuBasis.up} enuEast={enuBasis.east} enuNorth={enuBasis.north} observerPos={enuBasis.position} />

      {/* 观测者调试信息面板 — 显示经纬度 + 太阳方位 */}
      <Html position={[0, 0, 0]} fullscreen style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '6px 10px',
          borderRadius: 6,
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          color: '#ccc',
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: '18px',
          textAlign: 'right',
        }}>
          <div>纬度 {(latitude * 180/Math.PI).toFixed(1)}°{latitude >= 0 ? 'N' : 'S'}  /  经度 {(longitude * 180/Math.PI).toFixed(1)}°{longitude >= 0 ? 'E' : 'W'}</div>
          <div>太阳高度 {sunAltitude >= 0 ? '+' : ''}{(sunAltitude * 180/Math.PI).toFixed(1)}°  /  方位 {(sunAzAstro * 180/Math.PI).toFixed(1)}°</div>
          <div style={{ color: dayFactor > 0.5 ? '#ffcc00' : dayFactor > 0.1 ? '#ff8800' : '#6677aa' }}>
            {dayFactor > 0.9 ? '☀ 正午' : dayFactor > 0.5 ? '🌤 白天' : dayFactor > 0.1 ? '🌅 晨昏' : '🌙 夜晚'}
          </div>
        </div>
      </Html>

      {/* 环境光：夜间降低 */}
      <ambientLight intensity={0.05 + dayFactor * 0.35} />

      {/* 方向光源在 Group 外，使用世界空间太阳方向 */}
      <directionalLight
        position={sunDirWorld.clone().multiplyScalar(100)}
        intensity={Math.max(0.05, Math.sin(sunAltitude)) * 4 * dayFactor}
        color="#fffde0"
      />

      {/* 天空穹顶在 Group 外，使用世界空间太阳方向 */}
      <SkyDome
        sunDirection={sunDirWorld}
        sunAltitude={sunAltitude}
        atmosphereColor={atmosphereColor}
        observerPos={enuBasis.position}
        enuUp={enuBasis.up}
      />

      {/* ===== 球面切平面 Group ===== */}
      <group matrix={surfaceGroupMatrix} matrixAutoUpdate={false}>
        {/* 星空 */}
        <StarField sunAltitude={sunAltitude} />

        {/* 星座连线 */}
        {showConstellations && (
          <ConstellationLines lineWidth={constellationLineWidth} />
        )}

        {/* 黄道线 - 在局部坐标中计算 */}
        {showEcliptic && (
          <EclipticLineLocal lineWidth={eclipticLineWidth} axialTilt={axialTilt} sunDirLocal={sunDirLocal} enuBasis={enuBasis} />
        )}

        {/* 地平线 - XZ 平面 = 切平面 */}
        {showHorizon && (
          <HorizonCircle />
        )}

        {/* 方向标识 - 局部 ENU 坐标 */}
        <DirectionMarkers />

        {/* 天体运行轨迹 - 在局部坐标中计算 */}
        <CelestialTrajectoryLocal
          celestialBodies={celestialBodies}
          observerPlanet={planet}
          globalTime={globalTime}
          observerPlanetWorldPos={observerPlanetWorldPos}
          latitude={latitude}
          longitude={longitude}
          enuBasis={enuBasis}
        />

        {/* 太阳 - 局部坐标 */}
        <Sun direction={sunDirLocal} altitude={sunAltitude} starRadius={celestialBodies.find(b => b.type === 'star')?.radius ?? 8.0} />

        {/* 天体标记 - 局部坐标 */}
        <CelestialMarkersLocal
          celestialBodies={celestialBodies}
          observerPlanet={planet}
          globalTime={globalTime}
          observerPlanetWorldPos={observerPlanetWorldPos}
          latitude={latitude}
          longitude={longitude}
          atmosphereRefraction={atmosphereRefraction}
          refractionCoefficient={refractionCoefficient}
          markerSizeScale={markerSizeScale}
          enuBasis={enuBasis}
        />

        {/* 行星环 - 局部坐标 */}
        <PlanetRingArc observerPlanet={planet} latitude={latitude} />

        {/* 地面 - 局部坐标 Y=-0.5 */}
        <Ground planet={planet} sunDirection={sunDirLocal} sunAltitude={sunAltitude} observerLat={latitude} observerLon={longitude} />
      </group>

      {/* 大气辉光在 Group 外，使用世界方向 */}
      <AtmosphereGlow sunDirection={sunDirWorld} show={showAtmosphere} atmosphereColor={atmosphereColor} observerPos={enuBasis.position} enuUp={enuBasis.up} />
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
      camera={{ position: [0, 0, 0], fov, near: 0.01, far: 2000 }}
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

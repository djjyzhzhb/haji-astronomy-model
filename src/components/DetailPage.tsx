import { 
  ArrowLeft, Settings, Layers, RotateCw, ZoomIn, Zap, Cloud, Wind, Mountain, Palette, 
  Droplets, Maximize2, Sun, Moon, Sunrise, Cpu, Globe, Eye, EyeOff, Monitor, Maximize,
  Map, Plus, Minimize2, X, Clock
} from 'lucide-react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { useStore } from '../store'
import { getTexturesByType } from '../utils/textureGenerator'
import PerformanceMonitor from './PerformanceMonitor'
import MapPanel from './MapPanel'
import SurfaceView, { SurfaceViewHandle } from './SurfaceView'
import { usePlanetTexture, getIsHabitable } from '../utils/planetTextureCache'
import { Suspense, useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { QualityLevel, ViewPreset } from '../types'
import { calculateDate } from '../utils/calendar'
import { calculateSunSkyPosition } from '../utils/surfaceCoords'

// 时间常量
const DAY_IN_SECONDS = 24.15 * 3600

// 质量设置配置
const qualitySettings = {
  low: { segments: 64, textureRes: '1024' as const, shadow: false },
  medium: { segments: 128, textureRes: '2048' as const, shadow: true },
  high: { segments: 256, textureRes: '2048' as const, shadow: true },
  ultra: { segments: 512, textureRes: '4096' as const, shadow: true }
}

// 视角预设配置
const viewPresets = {
  'global': { position: [0, 0, 8] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'equator': { position: [8, 0, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'north-pole': { position: [0, 8, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'south-pole': { position: [0, -8, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'sun-facing': { position: [0, 2, -8] as [number, number, number], target: [0, 0, 0] as [number, number, number] }
}

// 大气着色器
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragmentShader = `
  uniform vec3 atmosphereColor;
  uniform float atmosphereDensity;
  uniform float glowIntensity;
  uniform vec3 sunDirection;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vec3 viewDir = normalize(-vPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
    
    // 基于太阳方向的光照
    float sunLight = max(dot(vNormal, sunDirection), 0.0);
    
    // 结合光照和视角
    float intensity = fresnel * (0.5 + sunLight * 0.5);
    
    // 渐变色
    vec3 color1 = atmosphereColor;
    vec3 color2 = vec3(0.2, 0.4, 0.8);
    float gradient = 1.0 - max(dot(viewDir, vNormal), 0.0);
    vec3 finalColor = mix(color1, color2, gradient * 0.5);
    
    gl_FragColor = vec4(finalColor, intensity * atmosphereDensity * glowIntensity);
  }
`

// 昼夜变化着色器
const dayNightVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec4 vShadowCoord;
  uniform mat4 shadowMatrix;
  
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewPosition = -worldPos.xyz;
    vShadowCoord = shadowMatrix * worldPos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const dayNightFragmentShader = `
  uniform sampler2D dayTexture;
  uniform vec3 sunDirection;
  uniform sampler2D shadowMap;
  uniform vec2 shadowMapSize;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec4 vShadowCoord;
  
  float getShadow() {
    if (shadowMapSize.x < 1.0) return 1.0;
    vec4 sc = vShadowCoord;
    sc.xyz /= sc.w;
    sc.xyz = sc.xyz * 0.5 + 0.5;
    if (sc.z > 1.0 || sc.z < 0.0) return 1.0;
    float shadow = 0.0;
    vec2 ts = 1.0 / shadowMapSize;
    for (float x = -1.5; x <= 1.5; x += 1.0) {
      for (float y = -1.5; y <= 1.5; y += 1.0) {
        float d = texture2D(shadowMap, sc.xy + vec2(x, y) * ts).r;
        shadow += sc.z - 0.003 > d ? 0.4 : 1.0;
      }
    }
    return shadow / 16.0;
  }
  
  void main() {
    vec3 normal = normalize(vNormal);
    float sunDot = dot(normal, sunDirection);

    vec4 dayColor = texture2D(dayTexture, vUv);

    // 暗面始终保留贴图纹理（最低亮度 ~0.25），带轻微蓝调
     float brightness = smoothstep(-0.2, 0.5, sunDot);
     brightness = mix(0.25, 1.0, brightness);
     vec3 darkTint = mix(vec3(0.5, 0.5, 0.9), vec3(1.0), brightness);
    vec3 finalRGB = dayColor.rgb * brightness * darkTint;

    float shadowFactor = getShadow();
    finalRGB *= shadowFactor;

    gl_FragColor = vec4(finalRGB, 1.0);
  }
`

// 云层着色器
const cloudVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const cloudFragmentShader = `
  uniform sampler2D cloudTexture;
  uniform vec3 sunDirection;
  uniform float cloudOpacity;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  
  void main() {
    vec4 cloudColor = texture2D(cloudTexture, vUv);
    float sunDot = dot(normalize(vNormal), sunDirection);
    
    // 晨昏线过渡，略宽于地表（云层更高，散射更多）
    float transition = smoothstep(-0.25, 0.25, sunDot);
    
    // 白天全白，夜晚渐暗至深灰，alpha 夜晚也降低
    vec3 dayColor = cloudColor.rgb;
    vec3 nightColor = cloudColor.rgb * 0.08;
    float nightAlpha = cloudColor.a * 0.15;
    
    vec3 finalRGB = mix(nightColor, dayColor, transition);
    float finalAlpha = mix(nightAlpha, cloudColor.a, transition) * cloudOpacity;
    
    gl_FragColor = vec4(finalRGB, finalAlpha);
  }
`

// 行星环着色器 —— 用碎片在环面上的方位计算光照，解决平面法线单一问题
const ringVertexShader = `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ringFragmentShader = `
  uniform vec3 ringColor;
  uniform vec3 sunDirection;
  uniform float opacity;
  uniform float emissiveStrength;
  varying vec3 vWorldPos;
  void main() {
    vec3 ringDir = normalize(vec3(vWorldPos.x, 0.0, vWorldPos.z));
    vec3 sunXZ   = normalize(vec3(sunDirection.x, 0.0, sunDirection.z));
    float sunDot = dot(ringDir, sunXZ);
    float lightFactor = smoothstep(-0.6, 0.6, sunDot);
    float brightness = mix(0.12, 1.0, lightFactor);
    vec3 finalRGB = ringColor * (brightness + emissiveStrength);
    gl_FragColor = vec4(finalRGB, opacity);
  }
`

function PlanetMesh({ customTexture }: { customTexture?: THREE.Texture | null }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const cloudsRef = useRef<THREE.Mesh>(null)
  const atmosphereInnerRef = useRef<THREE.Mesh>(null)
  const atmosphereOuterRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const ringGroupRef = useRef<THREE.Group>(null)
  const ringParticlesGroupRef = useRef<THREE.Group>(null)
  const ringParticlesRef = useRef<THREE.Points>(null)
  const { selectedPlanetId, celestialBodies, detailPageState, updateDetailPageState } = useStore()
  const { scene } = useThree()
  const lightRef = useRef<THREE.DirectionalLight | null>(null)
  const planetRotRef = useRef(0)
  const cloudRotRef = useRef(0)
  const ringRotRef = useRef(0)
  const lastGlobalTimeRef = useRef(detailPageState.globalTime)
  
  const planet = celestialBodies.find(body => body.id === selectedPlanetId)
  const textureType = planet?.textureType || 'earth-like'
  
  // 初始化时从星球数据同步参数（只在第一次进入时）
  useEffect(() => {
    if (planet) {
      // 同步基础参数
      updateDetailPageState({
        axialTilt: planet.axialTilt || 0.41,
        rotationSpeed: planet.rotationSpeed || 0.2,
      })
    }
  }, [planet?.id]) // 只在星球ID变化时触发
  
  const settings = useMemo(() => qualitySettings[detailPageState.qualityLevel], [detailPageState.qualityLevel])
  
  // 提取所有独立的参数，确保useMemo能正确响应变化
  const { 
    terrainRoughness, 
    cloudCoverage, 
    cloudOpacity,
    atmosphereDensity, 
    atmosphereColor, 
    seed 
  } = detailPageState.textureParams
  
  const { terrain, clouds, atmosphere } = useMemo(() => {
    const params = { 
      terrainRoughness, 
      cloudCoverage, 
      cloudOpacity,
      atmosphereDensity, 
      atmosphereColor, 
      seed,
      resolution: settings.textureRes 
    }
    return getTexturesByType(textureType, params)
  }, [
    textureType, 
    terrainRoughness, 
    cloudCoverage, 
    cloudOpacity,
    atmosphereDensity, 
    atmosphereColor, 
    seed, 
    settings.textureRes
  ])
  
  // 使用真实星球半径作为基础
  const baseRadius = planet?.radius || 2
  
  // 轴向倾斜
  const axialTilt = detailPageState.axialTilt

  // 持久化太阳方向引用，每帧用 .set() 更新，避免 useMemo 引用依赖问题
    const sunRef = useRef(new THREE.Vector3(Math.sin(detailPageState.dayTime * Math.PI * 2), 0, Math.cos(detailPageState.dayTime * Math.PI * 2)))
  
  // 大气材质
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        atmosphereColor: { value: new THREE.Color(detailPageState.textureParams.atmosphereColor) },
        atmosphereDensity: { value: detailPageState.textureParams.atmosphereDensity },
        glowIntensity: { value: detailPageState.atmosphereGlowIntensity },
        sunDirection: { value: sunRef.current }
      },
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailPageState.textureParams.atmosphereColor, detailPageState.textureParams.atmosphereDensity, detailPageState.atmosphereGlowIntensity])
  
  // 昼夜材质
  const dayNightMaterial = useMemo(() => {
    const dayTex = customTexture || terrain
    if (!dayTex) return null
    return new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTex },
        sunDirection: { value: sunRef.current },
        shadowMap: { value: null },
        shadowMatrix: { value: new THREE.Matrix4() },
        shadowMapSize: { value: new THREE.Vector2(4096, 4096) }
      },
      vertexShader: dayNightVertexShader,
      fragmentShader: dayNightFragmentShader
    })
  }, [terrain, customTexture])
  
  // 云层材质
  const cloudMaterial = useMemo(() => {
    if (!clouds) return null
    return new THREE.ShaderMaterial({
      uniforms: {
        cloudTexture: { value: clouds },
        sunDirection: { value: sunRef.current },
        cloudOpacity: { value: 1.0 }
      },
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: true,
      depthWrite: false
    })
  }, [clouds])
  
  // 环的 shadow-only 深度材质，透明环也能向星球投射阴影
  const ringDepthMaterial = useMemo(() => {
    return new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide,
    })
  }, [])

  const ringColor = (planet?.ringColor || '#d4a574')
  const ringColor3 = useMemo(() => new THREE.Color(ringColor), [ringColor])
  const emissiveBase = detailPageState.ringEmissiveIntensity

  const ringMatInner = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: ringColor3 },
      sunDirection: { value: sunRef.current },
      opacity: { value: 0.85 * detailPageState.ringOpacity },
      emissiveStrength: { value: emissiveBase },
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [ringColor3, detailPageState.ringOpacity, emissiveBase])

  const ringMatMid = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: ringColor3 },
      sunDirection: { value: sunRef.current },
      opacity: { value: 0.55 * detailPageState.ringOpacity },
      emissiveStrength: { value: emissiveBase * 0.7 },
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [ringColor3, detailPageState.ringOpacity, emissiveBase])

  const ringMatOuter = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: ringColor3 },
      sunDirection: { value: sunRef.current },
      opacity: { value: 0.35 * detailPageState.ringOpacity },
      emissiveStrength: { value: emissiveBase * 0.4 },
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [ringColor3, detailPageState.ringOpacity, emissiveBase])

  // 预生成环粒子数据，确保对齐赤道
  const ringParticleData = useMemo(() => {
    const count = detailPageState.ringParticleCount
    const positions = new Float32Array(count * 3)
    const minR = baseRadius * 1.5 * detailPageState.ringParticleRadiusScale
    const maxR = baseRadius * 2.3 * detailPageState.ringParticleRadiusScale
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = minR + Math.random() * (maxR - minR)
      const thickness = (Math.random() - 0.5) * 0.02
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius
      positions[i * 3 + 2] = thickness
    }
    return positions
  }, [detailPageState.ringParticleCount, detailPageState.ringParticleRadiusScale, baseRadius])
  
  useFrame((state, delta) => {
    // 每帧直接从 dayTime 计算世界空间太阳方向，用 .set() 更新持久化引用
    const angle = detailPageState.dayTime * Math.PI * 2
    sunRef.current.set(Math.sin(angle), 0, Math.cos(angle))
    
    // 更新大气材质 uniforms
    if (atmosphereInnerRef.current?.material instanceof THREE.ShaderMaterial) {
      atmosphereInnerRef.current.material.uniforms.sunDirection.value = sunRef.current
      atmosphereInnerRef.current.material.uniforms.atmosphereColor.value.set(detailPageState.textureParams.atmosphereColor)
      atmosphereInnerRef.current.material.uniforms.atmosphereDensity.value = detailPageState.textureParams.atmosphereDensity
      atmosphereInnerRef.current.material.uniforms.glowIntensity.value = detailPageState.atmosphereGlowIntensity
    }
    if (atmosphereOuterRef.current?.material instanceof THREE.ShaderMaterial) {
      atmosphereOuterRef.current.material.uniforms.sunDirection.value = sunRef.current
    }
    if (glowRef.current?.material instanceof THREE.ShaderMaterial) {
      glowRef.current.material.uniforms.sunDirection.value = sunRef.current
    }
    
    // 更新昼夜材质
    if (meshRef.current?.material instanceof THREE.ShaderMaterial) {
      const mat = meshRef.current.material
      mat.uniforms.sunDirection.value = sunRef.current
      // 每帧拉一次 directionalLight 的阴影数据注入 shader
      if (!lightRef.current) {
        scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
            lightRef.current = obj
          }
        })
      }
      if (lightRef.current?.shadow?.map?.texture) {
        mat.uniforms.shadowMap.value = lightRef.current.shadow.map.texture
        mat.uniforms.shadowMatrix.value.copy(lightRef.current.shadow.matrix)
        mat.uniforms.shadowMapSize.value.set(
          lightRef.current.shadow.mapSize.x,
          lightRef.current.shadow.mapSize.y
        )
      }
    }
    
    // 更新云层材质
    if (cloudsRef.current?.material instanceof THREE.ShaderMaterial) {
      cloudsRef.current.material.uniforms.sunDirection.value = sunRef.current
    }
    // 更新行星环材质
    ringMatInner.uniforms.sunDirection.value = sunRef.current
    ringMatMid.uniforms.sunDirection.value = sunRef.current
    ringMatOuter.uniforms.sunDirection.value = sunRef.current
    
    // 行星自转 - 基于 globalTime 差量累积，避免调速时跳变
    const { globalTime, rotationSpeed, cloudSpeed } = detailPageState
    let dt = globalTime - lastGlobalTimeRef.current
    // 处理时间重置 / 大幅跳变（如拖动时间滑块），允许跳变但限制单帧上限
    if (dt < 0) dt = 0
    if (dt > DAY_IN_SECONDS * 0.5) dt = DAY_IN_SECONDS * 0.5
    lastGlobalTimeRef.current = globalTime
    
    const radPerSec = 2 * Math.PI / DAY_IN_SECONDS
    planetRotRef.current += dt * rotationSpeed * radPerSec
    cloudRotRef.current += dt * cloudSpeed * radPerSec
    ringRotRef.current += dt * rotationSpeed * radPerSec
    
    if (meshRef.current) {
      meshRef.current.rotation.y = planetRotRef.current % (Math.PI * 2)
    }
    if (cloudsRef.current && detailPageState.showClouds) {
      cloudsRef.current.rotation.y = cloudRotRef.current % (Math.PI * 2)
    }
    // 行星环跟着星球自转而旋转
    if (ringGroupRef.current && planet?.hasRing && detailPageState.showRing) {
      ringGroupRef.current.children[0].rotation.z = ringRotRef.current % (Math.PI * 2)
    }
    if (ringParticlesGroupRef.current && planet?.hasRing && detailPageState.showRingParticles) {
      ringParticlesGroupRef.current.children[0].rotation.z = ringRotRef.current % (Math.PI * 2)
    }
  })
  
  return (
    <group scale={detailPageState.planetScale} rotation={[axialTilt, 0, 0]}>
      {/* Planet terrain with day/night cycle */}
      <mesh ref={meshRef} castShadow={settings.shadow} receiveShadow={settings.shadow}>
        <sphereGeometry args={[baseRadius, settings.segments, settings.segments]} />
        {dayNightMaterial ? (
          <primitive object={dayNightMaterial} />
        ) : customTexture ? (
          <meshStandardMaterial
            map={customTexture}
            roughness={0.7}
            metalness={0.05}
          />
        ) : terrain ? (
          <meshStandardMaterial
            map={terrain}
            roughness={0.7}
            metalness={0.05}
          />
        ) : planet ? (
          <meshStandardMaterial
            color={planet.color}
            roughness={0.8}
            metalness={0.05}
          />
        ) : null}
      </mesh>

      {/* Clouds layer with lighting */}
      {clouds && detailPageState.showClouds && (
        <mesh ref={cloudsRef} position={[0, 0, 0]}>
          <sphereGeometry args={[baseRadius * 1.01, settings.segments, settings.segments]} />
          {cloudMaterial ? (
            <primitive object={cloudMaterial} />
          ) : (
            <meshBasicMaterial
              map={clouds}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          )}
        </mesh>
      )}

      {/* Planet ring - PBR + 弱自发光，斜照光打在环面上 */}
      {planet?.hasRing && detailPageState.showRing && (
        <group ref={ringGroupRef}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            {/* 内环 */}
            <mesh castShadow={settings.shadow} customDepthMaterial={ringDepthMaterial} renderOrder={1}>
              <ringGeometry args={[
                baseRadius * 1.4 * detailPageState.ringInnerRadiusScale,
                baseRadius * 1.8 * detailPageState.ringOuterRadiusScale,
                128, 8
              ]} />
              <primitive object={ringMatInner} />
            </mesh>
            {/* 中环 */}
            <mesh castShadow={settings.shadow} customDepthMaterial={ringDepthMaterial} renderOrder={1}>
              <ringGeometry args={[
                baseRadius * 1.8 * detailPageState.ringInnerRadiusScale,
                baseRadius * 2.1 * detailPageState.ringOuterRadiusScale,
                128, 8
              ]} />
              <primitive object={ringMatMid} />
            </mesh>
            {/* 外环 */}
            <mesh castShadow={settings.shadow} customDepthMaterial={ringDepthMaterial} renderOrder={1}>
              <ringGeometry args={[
                baseRadius * 2.1 * detailPageState.ringInnerRadiusScale,
                baseRadius * 2.4 * detailPageState.ringOuterRadiusScale,
                128, 8
              ]} />
              <primitive object={ringMatOuter} />
            </mesh>
          </group>
        </group>
      )}
      {/* 粒子行星环 - 独立显示 */}
       {planet?.hasRing && detailPageState.showRingParticles && (
         <group ref={ringParticlesGroupRef}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <points ref={ringParticlesRef} renderOrder={3} key={detailPageState.ringParticleCount}>
              <bufferGeometry key={`bg-${detailPageState.ringParticleCount}`}>
                <bufferAttribute
                  attach="attributes-position"
                  count={detailPageState.ringParticleCount}
                  array={ringParticleData}
                  itemSize={3}
                />
              </bufferGeometry>
              <pointsMaterial
                color="#ffffff"
                size={0.03 * detailPageState.ringParticleSize}
                transparent
                opacity={detailPageState.ringParticleOpacity}
                sizeAttenuation
              />
            </points>
          </group>
        </group>
      )}

      {/* Atmosphere layers */}
      {detailPageState.showAtmosphere && (
        <group>
          {/* Inner atmosphere */}
          <mesh ref={atmosphereInnerRef}>
            <sphereGeometry args={[baseRadius * detailPageState.atmosphereInnerRadius, settings.segments, settings.segments]} />
            <primitive object={atmosphereMaterial} />
          </mesh>
          
          {/* Outer atmosphere */}
          <mesh ref={atmosphereOuterRef}>
            <sphereGeometry args={[baseRadius * detailPageState.atmosphereInnerRadius * 1.1, settings.segments, settings.segments]} />
            <shaderMaterial
              uniforms={{
                atmosphereColor: { value: new THREE.Color(detailPageState.textureParams.atmosphereColor) },
                atmosphereDensity: { value: detailPageState.textureParams.atmosphereDensity * 0.6 },
                glowIntensity: { value: detailPageState.atmosphereGlowIntensity },
                sunDirection: { value: sunRef.current }
              }}
              vertexShader={atmosphereVertexShader}
              fragmentShader={atmosphereFragmentShader}
              transparent
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          
          {/* Glow effect */}
          <mesh ref={glowRef}>
            <sphereGeometry args={[baseRadius * detailPageState.atmosphereOuterRadius, settings.segments, settings.segments]} />
            <shaderMaterial
              uniforms={{
                atmosphereColor: { value: new THREE.Color(0.8, 0.9, 1.0) },
                atmosphereDensity: { value: detailPageState.textureParams.atmosphereDensity * 0.3 },
                glowIntensity: { value: detailPageState.atmosphereGlowIntensity * 1.5 },
                sunDirection: { value: sunRef.current }
              }}
              vertexShader={atmosphereVertexShader}
              fragmentShader={atmosphereFragmentShader}
              transparent
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

function DetailScene({ viewPreset, customTexture }: { viewPreset: ViewPreset; customTexture?: THREE.Texture | null }) {
  const { detailPageState } = useStore()
  const orbitControlsRef = useRef<any>(null)
  const { camera } = useThree()
  
  // 视角预设切换
  useEffect(() => {
    const preset = viewPresets[viewPreset]
    if (orbitControlsRef.current && preset) {
      orbitControlsRef.current.target.set(...preset.target)
      orbitControlsRef.current.update()
      
      // 平滑过渡到新位置
      const startPos = camera.position.clone()
      const endPos = new THREE.Vector3(...preset.position)
      let progress = 0
      
      const animate = () => {
        progress += 0.05
        if (progress >= 1) return
        
        camera.position.lerpVectors(startPos, endPos, progress)
        camera.lookAt(...preset.target)
        requestAnimationFrame(animate)
      }
      animate()
    }
  }, [viewPreset, camera])
  
  // 计算太阳方向
  const sunDirection = useMemo(() => {
    const angle = detailPageState.dayTime * Math.PI * 2
    return new THREE.Vector3(Math.sin(angle) * 10, 0, Math.cos(angle) * 10)
  }, [detailPageState.dayTime])
  
  return (
    <>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.35} />
      {/* 主定向光源 - shadow frustum 放大到覆盖整圈环 */}
      <directionalLight
        position={sunDirection}
        intensity={2.5}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
      />
      <PlanetMesh customTexture={customTexture} />
      <OrbitControls
        ref={orbitControlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={20}
        enablePan={false}
      />
    </>
  )
}

function DetailPage() {
  const { 
    setCurrentPage, 
    setSelectedPlanetId, 
    selectedPlanetId, 
    celestialBodies,
    detailPageState,
    updateDetailPageState,
    updateTextureParams,
    navigateToMain,
    setSurfaceObservation,
    toggleSurfaceView,
  } = useStore()
  
  const planet = celestialBodies.find(body => body.id === selectedPlanetId)

  // 使用全局纹理缓存 hook，质量和地形参数变化时自动重新处理
  const customTexture = usePlanetTexture(
    getIsHabitable(planet?.textureType, planet?.type) ? import.meta.env.BASE_URL + 'map.jpg' : null,
    detailPageState.qualityLevel,
    detailPageState.textureParams.terrainRoughness,
    detailPageState.textureParams.seed
  )

  const [expandedSection, setExpandedSection] = useState<string | null>('basic')
  const [isPaused, setIsPaused] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const surfaceViewRef = useRef<SurfaceViewHandle>(null)
  const YEAR_IN_DAYS = 426.15
  const YEAR_IN_SECONDS = YEAR_IN_DAYS * DAY_IN_SECONDS
  const dayNightRef = useRef({
    globalTime: detailPageState.globalTime,
    speed: detailPageState.dayNightCycleSpeed
  })

  // 地表视角鼠标交互状态
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const yawPitchRef = useRef({ yaw: 0, pitch: 0 })
  
  // 同步 ref 最新值
  useEffect(() => {
    dayNightRef.current.globalTime = detailPageState.globalTime
    dayNightRef.current.speed = detailPageState.dayNightCycleSpeed
  }, [detailPageState.globalTime, detailPageState.dayNightCycleSpeed])

  // 昼夜循环自动更新（基于 globalTime）
  useEffect(() => {
    if (isPaused || dayNightRef.current.speed === 0) return
    
    const interval = setInterval(() => {
      const newGlobalTime = dayNightRef.current.globalTime + dayNightRef.current.speed * 0.01 * DAY_IN_SECONDS
      updateDetailPageState({
        globalTime: newGlobalTime,
        dayTime: (newGlobalTime / DAY_IN_SECONDS) % 1,
        yearTime: (newGlobalTime / YEAR_IN_SECONDS) % 1
      })
    }, 16)
    
    return () => clearInterval(interval)
  }, [isPaused, updateDetailPageState])

  const handleBack = () => {
    navigateToMain()
  }

  const toggleSection = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null)
    } else {
      setExpandedSection(section)
    }
  }

  const setDayTime = (time: number) => {
    updateDetailPageState({ dayTime: time })
  }

  const isSurfaceView = detailPageState.surfaceObservation.isSurfaceView

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isSurfaceView) return
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSurfaceView || !isDragging) return
    const deltaX = e.clientX - dragStartRef.current.x
    const deltaY = e.clientY - dragStartRef.current.y
    dragStartRef.current = { x: e.clientX, y: e.clientY }

    const newYaw = yawPitchRef.current.yaw + deltaX * 0.005
    const newPitch = Math.max(
      -Math.PI * 0.44,
      Math.min(Math.PI * 0.44, yawPitchRef.current.pitch + deltaY * 0.005)
    )

    yawPitchRef.current = { yaw: newYaw, pitch: newPitch }
    surfaceViewRef.current?.setYawPitch(newYaw, newPitch)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!isSurfaceView) return
    const currentFov = detailPageState.surfaceObservation.fov
    const newFov = e.deltaY > 0
      ? Math.min(90, currentFov + 2)
      : Math.max(30, currentFov - 2)
    setSurfaceObservation({ fov: newFov })
  }

  // 触控事件处理
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isSurfaceView) return
    const touch = e.touches[0]
    setIsDragging(true)
    dragStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSurfaceView || !isDragging) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - dragStartRef.current.x
    const deltaY = touch.clientY - dragStartRef.current.y
    dragStartRef.current = { x: touch.clientX, y: touch.clientY }

    const newYaw = yawPitchRef.current.yaw + deltaX * 0.005
    const newPitch = Math.max(
      -Math.PI * 0.44,
      Math.min(Math.PI * 0.44, yawPitchRef.current.pitch + deltaY * 0.005)
    )

    yawPitchRef.current = { yaw: newYaw, pitch: newPitch }
    surfaceViewRef.current?.setYawPitch(newYaw, newPitch)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // 切换到地表视角时重置相机朝向
  useEffect(() => {
    if (isSurfaceView) {
      yawPitchRef.current = { yaw: 0, pitch: 0 }
      surfaceViewRef.current?.setYawPitch(0, 0)
    } else {
      // 从地表视角切换回轨道视角时清理鼠标状态
      setIsDragging(false)
      yawPitchRef.current = { yaw: 0, pitch: 0 }
    }
  }, [isSurfaceView])

  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex flex-col relative overflow-hidden">
      {/* ===== 移动端竖屏旋转提示 ===== */}
      <div className="portrait-overlay select-none">
        <svg className="rotate-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#64a5ff" strokeWidth="2">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <path d="M12 6v12" />
        </svg>
        <p className="text-white text-lg font-semibold">请旋转手机</p>
        <p className="text-gray-400 text-sm">横屏体验更佳</p>
      </div>

      {/* ===== 顶部控制栏 ===== */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-2 py-1.5
        landscape-mobile:px-1 landscape-mobile:py-1
        bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-1.5 landscape-mobile:gap-1">
          {/* 返回按钮 */}
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-white rounded-lg transition-colors backdrop-blur-md border border-gray-700/50 text-sm
              landscape-mobile:px-2 landscape-mobile:py-1 landscape-mobile:text-xs landscape-mobile:gap-1"
          >
            <ArrowLeft size={18} className="landscape-mobile:w-4 landscape-mobile:h-4" />
            <span className="max-md:hidden">返回</span>
          </button>

          {/* 地表/轨道切换 */}
          <button
            onClick={toggleSurfaceView}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-white rounded-lg transition-colors backdrop-blur-md border border-gray-700/50 text-sm
              landscape-mobile:px-2 landscape-mobile:py-1 landscape-mobile:text-xs landscape-mobile:gap-1"
          >
            {isSurfaceView ? <Globe size={18} className="landscape-mobile:w-4 landscape-mobile:h-4" /> : <Mountain size={18} className="landscape-mobile:w-4 landscape-mobile:h-4" />}
            <span className="max-md:hidden">{isSurfaceView ? '轨道' : '地表'}</span>
          </button>

          {/* 地图按钮 */}
          <button
            onClick={() => setShowMap(!showMap)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/80 hover:bg-gray-700 text-white rounded-lg transition-colors backdrop-blur-md border border-gray-700/50 text-sm
              landscape-mobile:px-2 landscape-mobile:py-1 landscape-mobile:text-xs landscape-mobile:gap-1"
          >
            <Map size={18} className="landscape-mobile:w-4 landscape-mobile:h-4" />
            <span className="max-md:hidden">地图</span>
          </button>
        </div>

        {/* 页面标题 */}
        <h1 className="text-lg font-bold text-white drop-shadow-lg max-md:text-sm max-md:px-2 landscape-mobile:text-xs">
          {planet?.name || '精细行星视图'}
        </h1>

        <div className="flex items-center gap-1.5 landscape-mobile:gap-1">
          {/* 性能监控 */}
          <PerformanceMonitor />
        </div>
      </div>

      {/* ===== 3D 场景 ===== */}
      <div
        className="flex-1 w-full h-full relative"
        onMouseDown={isSurfaceView ? handleMouseDown : undefined}
        onMouseMove={isSurfaceView ? handleMouseMove : undefined}
        onMouseUp={isSurfaceView ? handleMouseUp : undefined}
        onMouseLeave={isSurfaceView ? handleMouseUp : undefined}
        onWheel={isSurfaceView ? handleWheel : undefined}
        onTouchStart={isSurfaceView ? handleTouchStart : undefined}
        onTouchMove={isSurfaceView ? handleTouchMove : undefined}
        onTouchEnd={isSurfaceView ? handleTouchEnd : undefined}
        style={{ cursor: isSurfaceView ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {isSurfaceView && planet ? (
          <SurfaceView
        ref={surfaceViewRef}
        planet={planet}
        dayTime={detailPageState.dayTime}
        yearProgress={detailPageState.yearTime || 0}
        globalTime={detailPageState.globalTime}
        latitude={detailPageState.surfaceObservation.latitude}
        longitude={detailPageState.surfaceObservation.longitude}
        fov={detailPageState.surfaceObservation.fov}
        onFovChange={(fov) => setSurfaceObservation({ fov })}
        celestialBodies={celestialBodies}
        showAtmosphere={detailPageState.showAtmosphere}
        atmosphereColor={detailPageState.textureParams.atmosphereColor}
        atmosphereRefraction={detailPageState.surfaceObservation.atmosphereRefraction}
        refractionCoefficient={detailPageState.surfaceObservation.refractionCoefficient}
        markerSizeScale={detailPageState.surfaceObservation.markerSizeScale}
        showConstellations={detailPageState.surfaceObservation.showConstellations}
        constellationLineWidth={detailPageState.surfaceObservation.constellationLineWidth}
        showEcliptic={detailPageState.surfaceObservation.showEcliptic}
        eclipticLineWidth={detailPageState.surfaceObservation.eclipticLineWidth}
        showHorizon={detailPageState.surfaceObservation.showHorizon}
      />
        ) : (
          <Canvas
            camera={{ position: [0, 0, 6], fov: 60 }}
            gl={{
              antialias: true,
              powerPreference: "high-performance",
            }}
            shadows
          >
            <Suspense fallback={null}>
              <DetailScene viewPreset={detailPageState.viewPreset} customTexture={customTexture} />
            </Suspense>
          </Canvas>
        )}
      </div>

      {showMap && (
        <MapPanel
          open={showMap}
          onClose={() => setShowMap(false)}
          textureUrl={import.meta.env.BASE_URL + 'map.jpg'}
          planetName={planet?.name || '行星'}
          onSelectPoint={(lat, lon) => {
            setSurfaceObservation({ latitude: lat, longitude: lon })
          }}
          dayTime={detailPageState.dayTime}
          yearProgress={detailPageState.yearTime}
          axialTilt={detailPageState.axialTilt}
        />
      )}

      {/* ===== 地表视角天象信息面板 ===== */}
      {isSurfaceView && (
        <div className="absolute bottom-2 left-2 z-30 bg-black/70 backdrop-blur-md rounded-lg p-2 border border-gray-700/50 max-w-[200px]
          landscape-mobile:max-w-[160px] landscape-mobile:p-1.5 landscape-mobile:text-xs">
          <div className="text-gray-400 text-[10px] landscape-mobile:text-[8px]">当前日期</div>
          <div className="text-white font-mono text-xs landscape-mobile:text-[10px]">
            第{calculateDate(detailPageState.yearTime || 0).year}年/{calculateDate(detailPageState.yearTime || 0).month}月/{calculateDate(detailPageState.yearTime || 0).day}日
          </div>
          <div className="text-gray-400 text-[10px] mt-1 landscape-mobile:text-[8px] landscape-mobile:mt-0.5">太阳高度角</div>
          <div className="text-white font-mono text-xs landscape-mobile:text-[10px]">
            {(calculateSunSkyPosition(
              detailPageState.surfaceObservation.latitude,
              detailPageState.surfaceObservation.longitude,
              detailPageState.dayTime,
              detailPageState.yearTime || 0,
              detailPageState.axialTilt
            ).altitude * 180 / Math.PI).toFixed(1)}°
          </div>
          <div className="text-gray-400 text-[10px] mt-1 landscape-mobile:text-[8px] landscape-mobile:mt-0.5">观测位置</div>
          <div className="text-white font-mono text-xs landscape-mobile:text-[10px]">
            {(detailPageState.surfaceObservation.latitude * 180 / Math.PI).toFixed(1)}°N, {(detailPageState.surfaceObservation.longitude * 180 / Math.PI).toFixed(1)}°E
          </div>
        </div>
      )}

      {/* ===== 底部信息条 ===== */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-20 landscape-mobile:bottom-1">
        <div className="bg-gray-800/85 backdrop-blur-md rounded-xl border border-gray-700/50 px-4 py-1.5 flex items-center gap-3 shadow-lg
          landscape-mobile:px-2 landscape-mobile:py-1 landscape-mobile:gap-1.5 landscape-mobile:rounded-lg">
          <div className="text-center landscape-mobile:text-[10px]">
            <span className="text-gray-400 text-[10px] landscape-mobile:text-[8px]">类型</span>
            <span className="text-white font-semibold text-xs landscape-mobile:text-[10px] ml-1">{planet?.type === 'planet' ? '类地' : planet?.type}</span>
          </div>
          <div className="w-px h-3 bg-gray-700" />
          <div className="text-center landscape-mobile:text-[10px]">
            <span className="text-gray-400 text-[10px] landscape-mobile:text-[8px]">直径</span>
            <span className="text-white font-semibold text-xs landscape-mobile:text-[10px] ml-1">{planet?.diameter || '12,742 km'}</span>
          </div>
          <div className="w-px h-3 bg-gray-700 max-md:hidden" />
          <div className="text-center max-md:hidden">
            <span className="text-gray-400 text-[10px]">质量</span>
            <span className="text-white font-semibold text-xs ml-1">{planet?.mass || '5.97e24 kg'}</span>
          </div>
          <div className="w-px h-3 bg-gray-700 max-md:hidden" />
          <div className="text-center max-md:hidden">
            <span className="text-gray-400 text-[10px]">温度</span>
            <span className="text-white font-semibold text-xs ml-1">{planet?.temperature || '288 K'}</span>
          </div>
          {isSurfaceView && (
            <>
              <div className="w-px h-3 bg-gray-700" />
              <div className="text-center landscape-mobile:text-[10px]">
                <span className="text-gray-400 text-[10px] landscape-mobile:text-[8px]">纬度</span>
                <span className="text-white font-semibold text-xs landscape-mobile:text-[10px] ml-1">{(detailPageState.surfaceObservation.latitude * 180 / Math.PI).toFixed(1)}°</span>
              </div>
              <div className="text-center landscape-mobile:text-[10px]">
                <span className="text-gray-400 text-[10px] landscape-mobile:text-[8px]">经度</span>
                <span className="text-white font-semibold text-xs landscape-mobile:text-[10px] ml-1">{(detailPageState.surfaceObservation.longitude * 180 / Math.PI).toFixed(1)}°</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== 参数控制面板 ===== */}
      <>
        {controlsOpen && (
          <div
            className="fixed inset-0 z-35 bg-black/30"
            onClick={() => setControlsOpen(false)}
          />
        )}
        {controlsOpen && !isSurfaceView && (
        <div className={`
          fixed z-40 transition-all duration-300 ease-in-out
          landscape-mobile:bottom-0 landscape-mobile:inset-x-0 landscape-mobile:rounded-t-xl landscape-mobile:max-h-[35vh]
          md:top-12 md:right-0 md:h-[calc(100vh-3rem)] md:rounded-l-2xl
          w-72 landscape-mobile:w-full md:w-80 bg-gray-800/95 backdrop-blur-md
          border border-gray-700/50 shadow-2xl overflow-hidden
          flex flex-col
          ${controlsOpen ? 'translate-x-0 landscape-mobile:translate-y-0' : 'md:translate-x-full landscape-mobile:translate-y-full'}
        `}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 shrink-0 landscape-mobile:px-2 landscape-mobile:py-1">
            <div className="flex items-center gap-1.5">
              <Settings size={16} className="text-blue-400 landscape-mobile:w-3.5 landscape-mobile:h-3.5" />
              <h3 className="text-white font-semibold text-sm landscape-mobile:text-xs">参数控制</h3>
            </div>
            <button
              onClick={() => setControlsOpen(false)}
              className="p-1 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X size={16} className="landscape-mobile:w-3.5 landscape-mobile:h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-700/50 landscape-mobile:overflow-x-hidden">
            {/* 基本参数 */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button
              onClick={() => toggleSection('basic')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1"
            >
              <div className="flex items-center gap-1.5">
                <Maximize2 size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">基本参数</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'basic' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'basic' && (
              <div className="space-y-3 landscape-mobile:space-y-1.5 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
                {/* 旋转速度 */}
                <div className="space-y-1.5 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <RotateCw size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">旋转速度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.rotationSpeed.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.05" value={detailPageState.rotationSpeed}
                    onChange={(e) => updateDetailPageState({ rotationSpeed: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>
                {/* 行星大小 */}
                <div className="space-y-1.5 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <ZoomIn size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">行星大小</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.planetScale.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="3" step="0.1" value={detailPageState.planetScale}
                    onChange={(e) => updateDetailPageState({ planetScale: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>
                {/* 轴向倾斜 */}
                <div className="space-y-1.5 landscape-mobile:space-y-0.5 landscape-mobile:col-span-2">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Globe size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">轴向倾斜</span>
                    <span className="ml-auto text-[10px] text-gray-400">{(detailPageState.axialTilt * 180 / Math.PI).toFixed(0)}°</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={detailPageState.axialTilt}
                    onChange={(e) => updateDetailPageState({ axialTilt: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>
              </div>
            )}
          </div>

          {/* 昼夜控制 — compact for mobile */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button
              onClick={() => toggleSection('dayNight')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1"
            >
              <div className="flex items-center gap-1.5">
                <Sun size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">昼夜控制</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'dayNight' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'dayNight' && (
              <div className="space-y-3 landscape-mobile:space-y-1.5 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
                <button onClick={() => setIsPaused(!isPaused)}
                  className="landscape-mobile:col-span-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs">
                  {isPaused ? <Sun size={14} /> : <Moon size={14} />}
                  {isPaused ? '继续' : '暂停'}
                </button>
                <div className="space-y-1.5 landscape-mobile:space-y-0.5 landscape-mobile:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <Sunrise size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                      <span className="text-xs landscape-mobile:text-[10px]">时间</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {detailPageState.dayTime < 0.25 ? '午夜' : detailPageState.dayTime < 0.5 ? '早晨' : detailPageState.dayTime < 0.75 ? '正午' : '傍晚'}
                    </span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={detailPageState.dayTime}
                    onChange={(e) => setDayTime(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                </div>
                <div className="space-y-1.5 landscape-mobile:space-y-0.5 landscape-mobile:col-span-2">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <RotateCw size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">循环速度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.dayNightCycleSpeed.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="0.5" step="0.01" value={detailPageState.dayNightCycleSpeed}
                    onChange={(e) => updateDetailPageState({ dayNightCycleSpeed: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                </div>
              </div>
            )}
          </div>

          {/* 视角预设 — compact */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('view')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Eye size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">视角预设</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'view' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'view' && (
              <div className="grid grid-cols-3 gap-1.5 landscape-mobile:gap-1">
                {Object.entries(viewPresets).map(([key, _]) => (
                  <button key={key} onClick={() => updateDetailPageState({ viewPreset: key as ViewPreset })}
                    className={`px-2 py-1.5 rounded text-[10px] transition-colors ${detailPageState.viewPreset === key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                    {key === 'global' ? '全局' : key === 'equator' ? '赤道' : key === 'north-pole' ? '北极' : key === 'south-pole' ? '南极' : '向阳'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 质量设置 */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('quality')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Cpu size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">质量设置</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'quality' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'quality' && (
              <div className="grid grid-cols-4 gap-1.5 landscape-mobile:gap-1">
                {(['low', 'medium', 'high', 'ultra'] as QualityLevel[]).map((level) => (
                  <button key={level} onClick={() => { updateDetailPageState({ qualityLevel: level }); updateTextureParams({ resolution: level === 'low' ? '1024' : level === 'ultra' ? '4096' : '2048' }) }}
                    className={`px-1 py-1.5 rounded text-[10px] transition-colors ${detailPageState.qualityLevel === level ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                    {level === 'low' ? '低' : level === 'medium' ? '中' : level === 'high' ? '高' : '超高'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 地形参数 — compact */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('terrain')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Mountain size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">地形参数</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'terrain' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'terrain' && (
              <div className="space-y-1.5 landscape-mobile:space-y-0.5">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Mountain size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                  <span className="text-xs landscape-mobile:text-[10px]">地形粗糙度</span>
                  <span className="ml-auto text-[10px] text-gray-400">{detailPageState.textureParams.terrainRoughness.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={detailPageState.textureParams.terrainRoughness}
                  onChange={(e) => updateTextureParams({ terrainRoughness: parseFloat(e.target.value), seed: Date.now() % 10000 })}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500" />
              </div>
            )}
          </div>

          {/* 云层参数 — compact */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('clouds')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Cloud size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">云层参数</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'clouds' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'clouds' && (
              <div className="space-y-2 landscape-mobile:space-y-1 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
                  <input type="checkbox" checked={detailPageState.showClouds}
                    onChange={(e) => updateDetailPageState({ showClouds: e.target.checked })}
                    className="accent-blue-500" />
                  <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">显示云层</span>
                </label>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Wind size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">云速</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.cloudSpeed.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="2" step="0.05" value={detailPageState.cloudSpeed}
                    onChange={(e) => updateDetailPageState({ cloudSpeed: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Cloud size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">覆盖度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.textureParams.cloudCoverage.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={detailPageState.textureParams.cloudCoverage}
                    onChange={(e) => updateTextureParams({ cloudCoverage: parseFloat(e.target.value), seed: Date.now() % 10000 })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Droplets size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">厚度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.textureParams.cloudOpacity.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.1" max="1.0" step="0.05" value={detailPageState.textureParams.cloudOpacity}
                    onChange={(e) => updateTextureParams({ cloudOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
              </div>
            )}
          </div>

          {/* 大气参数 — simplified for mobile */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('atmosphere')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Wind size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">大气参数</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'atmosphere' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'atmosphere' && (
              <div className="space-y-2 landscape-mobile:space-y-1 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
                  <input type="checkbox" checked={detailPageState.showAtmosphere}
                    onChange={(e) => updateDetailPageState({ showAtmosphere: e.target.checked })}
                    className="accent-blue-500" />
                  <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">显示大气</span>
                </label>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Droplets size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">密度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.textureParams.atmosphereDensity.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1.5" step="0.05" value={detailPageState.textureParams.atmosphereDensity}
                    onChange={(e) => updateTextureParams({ atmosphereDensity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Palette size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">颜色</span>
                  </div>
                  <input type="color" value={detailPageState.textureParams.atmosphereColor}
                    onChange={(e) => updateTextureParams({ atmosphereColor: e.target.value })}
                    className="w-full h-6 rounded cursor-pointer border border-gray-600" />
                </div>
              </div>
            )}
          </div>

          {/* 行星环参数 */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('ring')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Minimize2 size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">行星环</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'ring' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'ring' && (
              <div className="space-y-2 landscape-mobile:space-y-1 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
                  <input type="checkbox" checked={detailPageState.showRing}
                    onChange={(e) => updateDetailPageState({ showRing: e.target.checked })}
                    className="accent-blue-500" />
                  <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">显示环面</span>
                </label>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Eye size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">透明度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringOpacity.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={detailPageState.ringOpacity}
                    onChange={(e) => updateDetailPageState({ ringOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Sun size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">亮度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringEmissiveIntensity.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1.5" step="0.05" value={detailPageState.ringEmissiveIntensity}
                    onChange={(e) => updateDetailPageState({ ringEmissiveIntensity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Maximize2 size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">内径缩放</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringInnerRadiusScale.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="2" step="0.05" value={detailPageState.ringInnerRadiusScale}
                    onChange={(e) => updateDetailPageState({ ringInnerRadiusScale: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Maximize2 size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">外径缩放</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringOuterRadiusScale.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="2" step="0.05" value={detailPageState.ringOuterRadiusScale}
                    onChange={(e) => updateDetailPageState({ ringOuterRadiusScale: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
                  <input type="checkbox" checked={detailPageState.showRingParticles}
                    onChange={(e) => updateDetailPageState({ showRingParticles: e.target.checked })}
                    className="accent-blue-500" />
                  <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">显示粒子</span>
                </label>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Plus size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">粒子数</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringParticleCount}</span>
                  </div>
                  <input type="range" min="100" max="5000" step="100" value={detailPageState.ringParticleCount}
                    onChange={(e) => updateDetailPageState({ ringParticleCount: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Eye size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">粒径</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringParticleSize.toFixed(1)}x</span>
                  </div>
                  <input type="range" min="0.1" max="5" step="0.1" value={detailPageState.ringParticleSize}
                    onChange={(e) => updateDetailPageState({ ringParticleSize: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Maximize2 size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">粒子范围</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringParticleRadiusScale.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="2" step="0.05" value={detailPageState.ringParticleRadiusScale}
                    onChange={(e) => updateDetailPageState({ ringParticleRadiusScale: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
                <div className="space-y-1 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Eye size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">粒子透明度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{detailPageState.ringParticleOpacity.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={detailPageState.ringParticleOpacity}
                    onChange={(e) => updateDetailPageState({ ringParticleOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
              </div>
            )}
          </div>

          {/* 时间系统 — compact */}
          <div className="p-3 landscape-mobile:p-1.5">
            <button onClick={() => toggleSection('time')}
              className="w-full flex items-center justify-between text-white mb-2 hover:text-blue-300 transition-colors landscape-mobile:mb-1">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="landscape-mobile:w-3 landscape-mobile:h-3" />
                <span className="text-sm font-medium landscape-mobile:text-xs">时间系统</span>
              </div>
              <span className="text-xs text-gray-400 landscape-mobile:text-[10px]">
                {expandedSection === 'time' ? '收起' : '展开'}
              </span>
            </button>
            {expandedSection === 'time' && (
              <div className="space-y-2 landscape-mobile:space-y-1 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
                <div className="space-y-1 landscape-mobile:col-span-2 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <Sun size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">日进度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{(detailPageState.dayTime * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={detailPageState.dayTime}
                    onChange={(e) => updateDetailPageState({ dayTime: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                </div>
                <div className="space-y-1 landscape-mobile:col-span-2 landscape-mobile:space-y-0.5">
                  <div className="flex items-center gap-1.5 text-gray-300">
                    <RotateCw size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                    <span className="text-xs landscape-mobile:text-[10px]">年进度</span>
                    <span className="ml-auto text-[10px] text-gray-400">{((detailPageState.yearTime || 0) * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.01" value={detailPageState.yearTime || 0}
                    onChange={(e) => updateDetailPageState({ yearTime: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                </div>
                <div className="landscape-mobile:col-span-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-300">
                  <span>本地日 <span className="text-yellow-400">24.15h</span></span>
                  <span>本地年 <span className="text-yellow-400">426.15d</span></span>
                  <span>月相 <span className="text-yellow-400">41.3d</span></span>
                  <span>小/大月 <span className="text-yellow-400">7×41/3×42</span></span>
                </div>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-700/50 bg-gray-900/50 shrink-0 landscape-mobile:p-1">
            <p className="text-gray-400 text-[10px] text-center landscape-mobile:text-[8px]">调整参数会重新生成纹理</p>
          </div>
          </div>
        </div>
        )}
        {controlsOpen && isSurfaceView && (
        <div className={`
          fixed z-40 transition-all duration-300 ease-in-out
          landscape-mobile:bottom-0 landscape-mobile:inset-x-0 landscape-mobile:rounded-t-xl landscape-mobile:max-h-[35vh]
          md:top-12 md:right-0 md:h-[calc(100vh-3rem)] md:rounded-l-2xl
          w-72 landscape-mobile:w-full md:w-80 bg-gray-800/95 backdrop-blur-md
          border border-gray-700/50 shadow-2xl overflow-hidden
          flex flex-col
          ${controlsOpen ? 'translate-x-0 landscape-mobile:translate-y-0' : 'md:translate-x-full landscape-mobile:translate-y-full'}
        `}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 shrink-0 landscape-mobile:px-2 landscape-mobile:py-1">
            <div className="flex items-center gap-1.5">
              <Settings size={16} className="text-blue-400 landscape-mobile:w-3.5 landscape-mobile:h-3.5" />
              <h3 className="text-white font-semibold text-sm landscape-mobile:text-xs">地表观测</h3>
            </div>
            <button
              onClick={() => setControlsOpen(false)}
              className="p-1 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X size={16} className="landscape-mobile:w-3.5 landscape-mobile:h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 landscape-mobile:p-1.5 landscape-mobile:grid landscape-mobile:grid-cols-2 landscape-mobile:gap-2">
            {/* 大气折射开关 */}
            <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
              <input type="checkbox" checked={detailPageState.surfaceObservation.atmosphereRefraction}
                onChange={(e) => setSurfaceObservation({ atmosphereRefraction: e.target.checked })}
                className="accent-blue-500" />
              <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">大气折射</span>
            </label>

            {/* 折射系数 */}
            <div className="space-y-1.5 landscape-mobile:space-y-0.5">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Eye size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                <span className="text-xs landscape-mobile:text-[10px]">折射系数</span>
                <span className="ml-auto text-[10px] text-gray-400">{detailPageState.surfaceObservation.refractionCoefficient.toFixed(1)}</span>
              </div>
              <input type="range" min="0.1" max="2.0" step="0.1" value={detailPageState.surfaceObservation.refractionCoefficient}
                onChange={(e) => setSurfaceObservation({ refractionCoefficient: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            {/* 标记大小 */}
            <div className="space-y-1.5 landscape-mobile:space-y-0.5">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Maximize2 size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                <span className="text-xs landscape-mobile:text-[10px]">标记大小</span>
                <span className="ml-auto text-[10px] text-gray-400">{detailPageState.surfaceObservation.markerSizeScale.toFixed(1)}</span>
              </div>
              <input type="range" min="0.5" max="3.0" step="0.1" value={detailPageState.surfaceObservation.markerSizeScale}
                onChange={(e) => setSurfaceObservation({ markerSizeScale: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            {/* 星座显示 */}
            <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
              <input type="checkbox" checked={detailPageState.surfaceObservation.showConstellations}
                onChange={(e) => setSurfaceObservation({ showConstellations: e.target.checked })}
                className="accent-blue-500" />
              <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">星座显示</span>
            </label>

            {/* 星座线宽 */}
            <div className="space-y-1.5 landscape-mobile:space-y-0.5">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Minimize2 size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                <span className="text-xs landscape-mobile:text-[10px]">星座线宽</span>
                <span className="ml-auto text-[10px] text-gray-400">{detailPageState.surfaceObservation.constellationLineWidth.toFixed(1)}</span>
              </div>
              <input type="range" min="0.5" max="5.0" step="0.5" value={detailPageState.surfaceObservation.constellationLineWidth}
                onChange={(e) => setSurfaceObservation({ constellationLineWidth: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            {/* 黄道显示 */}
            <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
              <input type="checkbox" checked={detailPageState.surfaceObservation.showEcliptic}
                onChange={(e) => setSurfaceObservation({ showEcliptic: e.target.checked })}
                className="accent-blue-500" />
              <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">黄道显示</span>
            </label>

            {/* 黄道线宽 */}
            <div className="space-y-1.5 landscape-mobile:space-y-0.5">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Minimize2 size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                <span className="text-xs landscape-mobile:text-[10px]">黄道线宽</span>
                <span className="ml-auto text-[10px] text-gray-400">{detailPageState.surfaceObservation.eclipticLineWidth.toFixed(1)}</span>
              </div>
              <input type="range" min="0.5" max="5.0" step="0.5" value={detailPageState.surfaceObservation.eclipticLineWidth}
                onChange={(e) => setSurfaceObservation({ eclipticLineWidth: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>

            {/* 地平线显示 */}
            <label className="flex items-center gap-1.5 cursor-pointer landscape-mobile:col-span-2">
              <input type="checkbox" checked={detailPageState.surfaceObservation.showHorizon}
                onChange={(e) => setSurfaceObservation({ showHorizon: e.target.checked })}
                className="accent-blue-500" />
              <span className="text-gray-300 text-xs landscape-mobile:text-[10px]">地平线显示</span>
            </label>

            {/* FOV */}
            <div className="space-y-1.5 landscape-mobile:space-y-0.5 landscape-mobile:col-span-2">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Eye size={12} className="landscape-mobile:w-2.5 landscape-mobile:h-2.5" />
                <span className="text-xs landscape-mobile:text-[10px]">视场角</span>
                <span className="ml-auto text-[10px] text-gray-400">{detailPageState.surfaceObservation.fov}°</span>
              </div>
              <input type="range" min="30" max="90" step="1" value={detailPageState.surfaceObservation.fov}
                onChange={(e) => setSurfaceObservation({ fov: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
          </div>
        </div>
        )}

        {/* 参数面板触发按钮 */}
        <button
          onClick={() => setControlsOpen(!controlsOpen)}
          className={`
            fixed z-40 transition-all duration-300 flex items-center justify-center
            bg-gray-800/80 hover:bg-gray-700 backdrop-blur-md border border-gray-700/50
            text-gray-300 hover:text-white cursor-pointer shadow-lg
            md:top-1/2 md:-translate-y-1/2 md:right-0 md:w-8 md:h-24 md:rounded-l-lg md:flex-col md:gap-2 md:text-xs
            landscape-mobile:bottom-0 landscape-mobile:left-1/2 landscape-mobile:-translate-x-1/2 landscape-mobile:w-12 landscape-mobile:h-7 landscape-mobile:rounded-t-lg landscape-mobile:px-3 landscape-mobile:py-1
            ${controlsOpen ? 'landscape-mobile:translate-y-full md:translate-x-8' : 'md:translate-x-0'}
          `}
        >
          <Settings size={16} className="landscape-mobile:w-3.5 landscape-mobile:h-3.5" />
          <span className="md:[writing-mode:vertical-lr] landscape-mobile:hidden md:inline">参数</span>
        </button>
      </>
    </div>
  )
}

export default DetailPage

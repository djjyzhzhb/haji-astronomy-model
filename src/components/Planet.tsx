import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CelestialBody } from '../types'
import { useStore } from '../store'
import Moon from './Moon'
import Orbit from './Orbit'
import { getTextureByType } from '../utils/textureGenerator'
import { usePlanetTexture, getIsHabitable } from '../utils/planetTextureCache'
import { calculateOrbitalPositionScaled } from '../utils/keplerOrbit'

// 环着色器 — 全3D光照 + 相位梯度（迎光面亮→背光面暗）
const ringVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    // 环局部法向量：ringGeometry 在 XY 面，经 π/2 绕 X 旋转后法向量指向 Y
    vWorldNormal = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ringFragmentShader = /* glsl */ `
  uniform vec3 ringColor;
  uniform vec3 sunDirection;
  uniform float opacity;
  uniform float emissiveStrength;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(sunDirection);
    vec3 ringDir = normalize(vWorldPos);

    // 环平面倾角光照：环面法向量与太阳方向的夹角决定整体亮度
    float tiltLight = abs(dot(N, L));

    // 相位光照：环上迎太阳侧亮、背太阳侧暗（沿环面的方位角梯度）
    float phaseDot = dot(ringDir, L);
    float phaseLight = smoothstep(-0.6, 0.6, phaseDot);

    // 组合：倾角调制基础范围，相位产生明暗梯度
    float diffuse = tiltLight * mix(0.10, 1.0, phaseLight);
    float brightness = diffuse + emissiveStrength;
    vec3 finalRGB = ringColor * brightness;
    gl_FragColor = vec4(finalRGB, opacity);
  }
`

interface PlanetProps {
  body: CelestialBody
  moons: CelestialBody[]
}

function Planet({ body, moons }: PlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const tiltGroupRef = useRef<THREE.Group>(null)
  const ringGroupRef = useRef<THREE.Group>(null)
  const { selectBody, showOrbits, distanceScale, sizeScale, showAtmosphere, showRings, showShadows } = useStore()

  const texture = useMemo(() => {
    try {
      if (body.textureType && body.textureType !== 'none') {
        return getTextureByType(body.textureType)
      }
    } catch (error) {
      console.error('纹理生成失败:', error)
    }
    return null
  }, [body.textureType])

  // 主页用低一档精度，roughness 和 seed 用默认中性值
  const customTexture = usePlanetTexture(
    getIsHabitable(body.textureType, body.type) ? import.meta.env.BASE_URL + 'map.jpg' : null,
    'low',
    0,
    0
  )

  const ringDepthMaterial = useMemo(() => {
    return new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
  }, [])

  // 环的 ShaderMaterial（三层，不同 opacity / emissiveStrength）
  const ringColorHex = body.ringColor || '#d4a574'
  const ringMatInner = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: new THREE.Color(ringColorHex) },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      opacity: { value: 0.85 },
      emissiveStrength: { value: 0.3 },
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [ringColorHex])
  const ringMatMid = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: new THREE.Color(ringColorHex) },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      opacity: { value: 0.55 },
      emissiveStrength: { value: 0.2 },
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [ringColorHex])
  const ringMatOuter = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      ringColor: { value: new THREE.Color(ringColorHex) },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      opacity: { value: 0.35 },
      emissiveStrength: { value: 0.12 },
    },
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [ringColorHex])

  const previousTime = useRef(0)
  const sunDirectionRef = useRef(new THREE.Vector3())

  useFrame(() => {
    const T = useStore.getState().timeSystem.T

    if (groupRef.current && body.orbitalElements) {
      const pos = calculateOrbitalPositionScaled(T, body.orbitalElements, distanceScale, 50)
      groupRef.current.position.set(pos.x, pos.y, pos.z)
    } else if (groupRef.current && body.distance && body.orbitSpeed) {
      const angle = T * body.orbitSpeed * 0.1
      groupRef.current.position.x = Math.cos(angle) * body.distance * distanceScale
      groupRef.current.position.z = Math.sin(angle) * body.distance * distanceScale
    }

    // 计算太阳方向（恒星在原点，行星位置的反方向指向太阳）
    if (groupRef.current) {
      groupRef.current.getWorldPosition(sunDirectionRef.current)
      sunDirectionRef.current.negate().normalize()
    }

    // 更新环 shader 的 sunDirection uniform
    const sd = sunDirectionRef.current
    ringMatInner.uniforms.sunDirection.value.set(sd.x, sd.y, sd.z)
    ringMatMid.uniforms.sunDirection.value.set(sd.x, sd.y, sd.z)
    ringMatOuter.uniforms.sunDirection.value.set(sd.x, sd.y, sd.z)

    // 使用时间差来更新自转，与时间缩放同步
    const dt = T - previousTime.current
    if (meshRef.current && body.rotationSpeed) {
      meshRef.current.rotation.y += body.rotationSpeed * dt
    }

    // 行星环跟随自转方向旋转（环内物质公转方向 = 行星自转方向）
    if (ringGroupRef.current && body.hasRing && showRings) {
      ringGroupRef.current.rotation.z += (body.rotationSpeed || 0.01) * dt
    }

    previousTime.current = T
  })

  const scaledRadius = body.radius * sizeScale

  return (
    <group ref={groupRef}>
      {/* 倾斜轴组 - 自转轴倾角 */}
      <group ref={tiltGroupRef} rotation={[body.axialTilt || 0, 0, 0]}>
        {/* 行星环：赤道面内，π/2 绕 X 旋转使 ringGeometry 的 XY 面变为 XZ（赤道）面 */}
        {body.hasRing && showRings && (
          <group ref={ringGroupRef} rotation={[Math.PI / 2, 0, 0]}>
            {/* 内环 - 较亮 */}
            <mesh
              material={ringMatInner}
              customDepthMaterial={ringDepthMaterial}
              renderOrder={1}
            >
              <ringGeometry args={[scaledRadius * 1.4, scaledRadius * 1.8, 128, 8]} />
            </mesh>
            {/* 中环 - 中等亮度 */}
            <mesh
              material={ringMatMid}
              customDepthMaterial={ringDepthMaterial}
              renderOrder={1}
            >
              <ringGeometry args={[scaledRadius * 1.8, scaledRadius * 2.1, 128, 8]} />
            </mesh>
            {/* 外环 - 较暗 */}
            <mesh
              material={ringMatOuter}
              customDepthMaterial={ringDepthMaterial}
              renderOrder={1}
            >
              <ringGeometry args={[scaledRadius * 2.1, scaledRadius * 2.4, 128, 8]} />
            </mesh>
            {/* 细节粒子 — 模拟稀薄环的离散岩屑 */}
            <points renderOrder={3}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={200}
                  array={new Float32Array(
                    Array.from({ length: 600 }, () => {
                      const angle = Math.random() * Math.PI * 2
                      const radius = scaledRadius * (1.6 + Math.random() * 0.3)
                      const thickness = (Math.random() - 0.5) * 0.02
                      return [
                        Math.cos(angle) * radius,
                        Math.sin(angle) * radius,
                        thickness
                      ]
                    }).flat()
                  )}
                  itemSize={3}
                />
              </bufferGeometry>
              <pointsMaterial
                color="#ffffff"
                size={0.03}
                transparent
                opacity={0.6}
                sizeAttenuation
              />
            </points>
          </group>
        )}

        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation()
            selectBody(body)
          }}
          castShadow={showShadows}
          receiveShadow={showShadows}
          renderOrder={2}
        >
          <sphereGeometry args={[scaledRadius, 128, 128]} />
          {customTexture ? (
            <meshStandardMaterial
              map={customTexture}
              roughness={0.7}
              metalness={0.05}
            />
          ) : texture ? (
            <meshStandardMaterial
              map={texture}
              roughness={0.7}
              metalness={0.05}
            />
          ) : (
            <meshStandardMaterial
              color={body.color}
              roughness={0.8}
              metalness={0.05}
            />
          )}
        </mesh>

        {/* 大气层效果 - 仅类地行星 */}
        {body.textureType === 'earth-like' && showAtmosphere && (
          <group renderOrder={3}>
            <mesh scale={[1.05, 1.05, 1.05]}>
              <sphereGeometry args={[scaledRadius, 64, 64]} />
              <meshBasicMaterial
                color="#4a90d9"
                transparent
                opacity={0.18}
                side={THREE.BackSide}
                depthWrite={false}
              />
            </mesh>
            <mesh scale={[1.1, 1.1, 1.1]}>
              <sphereGeometry args={[scaledRadius, 64, 64]} />
              <meshBasicMaterial
                color="#66bbee"
                transparent
                opacity={0.08}
                side={THREE.BackSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
        )}

        {/* 卫星 */}
        {moons.map(moon => (
          <group key={moon.id}>
            {showOrbits && moon.distance && (
              <Orbit body={moon} />
            )}
            <Moon body={moon} />
          </group>
        ))}
      </group>
    </group>
  )
}

export default Planet
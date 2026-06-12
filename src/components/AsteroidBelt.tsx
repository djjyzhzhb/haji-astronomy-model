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

// ─── GLSL：每颗粒子在 GPU 上根据 radius / 初始角度 / y 偏移计算位置 ───
const asteroidVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDistanceScale;
  uniform float uPixelRatio;

  attribute float aRadius;
  attribute float aInitialAngle;
  attribute float aYHeight;
  attribute float aSize;
  attribute vec3 aColor;

  varying vec3 vParticleColor;
  varying float vParticleOpacity;

  // 角速度 0.2/r，与原始 JS 实现的 speed*delta 系数一致
  // uTime 由 CPU 累积 delta 得到，保证与原速度完全相同
  void main() {
    float angle = aInitialAngle + uTime * (0.2 / aRadius);

    vec3 pos = vec3(
      cos(angle) * aRadius,
      aYHeight,
      sin(angle) * aRadius
    ) * uDistanceScale;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * 300.0 * uPixelRatio / -mvPosition.z;

    vParticleColor = aColor;
    vParticleOpacity = 0.9;
  }
`

const asteroidFragmentShader = /* glsl */ `
  varying vec3 vParticleColor;
  varying float vParticleOpacity;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.35, dist) * vParticleOpacity;
    gl_FragColor = vec4(vParticleColor, alpha);
  }
`

function AsteroidBelt({ innerRadius, outerRadius, count, color = '#8b8b8b' }: AsteroidBeltProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const localTimeRef = useRef(0)
  const { distanceScale } = useStore()

  // 预生成每颗粒子的初始状态 —— 只在 count/color/inner/outer 变化时重建
  const { radii, initialAngles, yHeights, sizes, colors, particleCount } = useMemo(() => {
    const radiiArr = new Float32Array(count)
    const initialAnglesArr = new Float32Array(count)
    const yHeightsArr = new Float32Array(count)
    const sizesArr = new Float32Array(count)
    const colorsArr = new Float32Array(count * 3)

    const colorObj = new THREE.Color(color)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = (Math.random() - 0.5) * 0.2
      const radius = innerRadius + Math.random() * (outerRadius - innerRadius)

      radiiArr[i] = radius
      initialAnglesArr[i] = theta
      yHeightsArr[i] = Math.sin(phi) * 2

      const variation = 0.7 + Math.random() * 0.6
      colorsArr[i * 3] = colorObj.r * variation
      colorsArr[i * 3 + 1] = colorObj.g * variation
      colorsArr[i * 3 + 2] = colorObj.b * variation

      sizesArr[i] = 0.3 + Math.random() * 0.7
    }

    return {
      radii: radiiArr,
      initialAngles: initialAnglesArr,
      yHeights: yHeightsArr,
      sizes: sizesArr,
      colors: colorsArr,
      particleCount: count,
    }
  }, [count, color, innerRadius, outerRadius])

  // 每帧仅更新 2 个 uniforms：uTime 和 uDistanceScale
  useFrame((_, delta) => {
    localTimeRef.current += delta
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = localTimeRef.current
      materialRef.current.uniforms.uDistanceScale.value = distanceScale
    }
  })

  return (
    <points>
      <bufferGeometry>
        {/* Three 需要 position attribute 存在（用于包围盒），但 shader 不读取它 */}
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={new Float32Array(particleCount * 3)}
          itemSize={3}
        />
        <bufferAttribute attach="attributes-aRadius"        count={particleCount} array={radii}        itemSize={1} />
        <bufferAttribute attach="attributes-aInitialAngle"  count={particleCount} array={initialAngles} itemSize={1} />
        <bufferAttribute attach="attributes-aYHeight"       count={particleCount} array={yHeights}      itemSize={1} />
        <bufferAttribute attach="attributes-aSize"          count={particleCount} array={sizes}         itemSize={1} />
        <bufferAttribute attach="attributes-aColor"         count={particleCount} array={colors}        itemSize={3} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={asteroidVertexShader}
        fragmentShader={asteroidFragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uDistanceScale: { value: distanceScale },
          uPixelRatio: { value: window.devicePixelRatio || 1 },
        }}
        transparent
        depthWrite={false}
      />
    </points>
  )
}

export default AsteroidBelt

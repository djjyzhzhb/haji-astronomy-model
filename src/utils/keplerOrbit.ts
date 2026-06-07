import * as THREE from 'three'

/**
 * 开普勒轨道计算工具
 * 基于真实的天体物理学公式
 */

export interface OrbitalElements {
  semiMajorAxis: number      // 半长轴 (a)
  eccentricity: number       // 离心率 (e)
  inclination: number        // 倾角 (i)
  longitudeOfAscendingNode: number // 升交点黄经 (Ω)
  argumentOfPeriapsis: number // 近心点幅角 (ω)
  meanAnomaly: number        // 平近点角 (M0)
}

/**
 * 计算轨道周期（开普勒第三定律）
 * T² = a³，其中 a 以 AU 为单位，T 以年为单位
 * 在我们的缩放系统中，简单使用 T ∝ a^(3/2)
 */
export function calculateOrbitalPeriod(semiMajorAxis: number): number {
  return Math.pow(semiMajorAxis, 1.5)
}

/**
 * 求解开普勒方程：E - e*sin(E) = M
 * 使用牛顿-拉夫逊法迭代求解
 */
export function solveKeplerEquation(meanAnomaly: number, eccentricity: number, tolerance: number = 1e-8): number {
  let eccentricAnomaly = meanAnomaly
  
  // 迭代求解
  for (let i = 0; i < 100; i++) {
    const delta = (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) / 
                  (1 - eccentricity * Math.cos(eccentricAnomaly))
    eccentricAnomaly -= delta
    
    if (Math.abs(delta) < tolerance) {
      break
    }
  }
  
  return eccentricAnomaly
}

/**
 * 将轨道坐标转换为三维空间坐标
 * 轨道主要在 X-Z 平面（赤道平面），Y 为竖直轴
 */
export function convertOrbitalToCartesian(
  trueAnomaly: number,
  elements: OrbitalElements
): { x: number; y: number; z: number } {
  const { semiMajorAxis, eccentricity, inclination, longitudeOfAscendingNode, argumentOfPeriapsis } = elements
  
  // 计算距离（椭圆轨道半径）
  const r = semiMajorAxis * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(trueAnomaly))
  
  // 在轨道平面内的坐标
  const xOrbit = r * Math.cos(trueAnomaly)
  const zOrbit = r * Math.sin(trueAnomaly)  // 改为 z 轴而不是 y 轴
  
  // 旋转到三维空间（欧拉角变换）
  const cosΩ = Math.cos(longitudeOfAscendingNode)
  const sinΩ = Math.sin(longitudeOfAscendingNode)
  const cosω = Math.cos(argumentOfPeriapsis)
  const sinω = Math.sin(argumentOfPeriapsis)
  const cosi = Math.cos(inclination)
  const sini = Math.sin(inclination)
  
  // 正确的轨道旋转，保持轨道主要在 X-Z 平面
  const x = xOrbit * (cosΩ * cosω - sinΩ * sinω * cosi) - 
            zOrbit * (cosΩ * sinω + sinΩ * cosω * cosi)
  const z = xOrbit * (sinΩ * cosω + cosΩ * sinω * cosi) - 
            zOrbit * (sinΩ * sinω - cosΩ * cosω * cosi)
  const y = xOrbit * sinω * sini + zOrbit * cosω * sini
  
  return { x, y, z }
}

/**
 * 计算在给定时间的轨道位置
 */
export function calculateOrbitalPosition(
  time: number,
  elements: OrbitalElements,
  basePeriod: number = 1
): { x: number; y: number; z: number } {
  // 计算平近点角随时间的变化
  const period = calculateOrbitalPeriod(elements.semiMajorAxis) * basePeriod
  const meanAnomaly = (elements.meanAnomaly + (2 * Math.PI * time) / period) % (2 * Math.PI)
  
  // 求解偏近点角
  const eccentricAnomaly = solveKeplerEquation(meanAnomaly, elements.eccentricity)
  
  // 计算真近点角
  const trueAnomaly = 2 * Math.atan2(
    Math.sqrt(1 + elements.eccentricity) * Math.sin(eccentricAnomaly / 2),
    Math.sqrt(1 - elements.eccentricity) * Math.cos(eccentricAnomaly / 2)
  )
  
  // 转换为三维坐标
  return convertOrbitalToCartesian(trueAnomaly, elements)
}

/**
 * 创建简化的轨道参数（用于我们的模型）
 */
export function createSimpleOrbit(distance: number, eccentricity: number = 0, inclination: number = 0): OrbitalElements {
  return {
    semiMajorAxis: distance,
    eccentricity,
    inclination,  // 倾角：相对于 X-Z 平面
    longitudeOfAscendingNode: 0,  // 升交点黄经设为0，简化
    argumentOfPeriapsis: Math.random() * Math.PI * 2,  // 近心点位置随机
    meanAnomaly: Math.random() * Math.PI * 2,  // 初始位置随机
  }
}

/**
 * 获取轨道上的点（用于绘制轨道线）
 */
export function getOrbitPoints(elements: OrbitalElements, segments: number = 128, distanceScale: number = 1): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  
  for (let i = 0; i <= segments; i++) {
    const meanAnomaly = (i / segments) * Math.PI * 2
    const eccentricAnomaly = solveKeplerEquation(meanAnomaly, elements.eccentricity)
    const trueAnomaly = 2 * Math.atan2(
      Math.sqrt(1 + elements.eccentricity) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - elements.eccentricity) * Math.cos(eccentricAnomaly / 2)
    )
    
    const pos = convertOrbitalToCartesian(trueAnomaly, elements)
    points.push(new THREE.Vector3(pos.x * distanceScale, pos.y * distanceScale, pos.z * distanceScale))
  }
  
  return points
}

/**
 * 计算在给定时间的轨道位置（带距离缩放）
 */
export function calculateOrbitalPositionScaled(
  time: number,
  elements: OrbitalElements,
  distanceScale: number = 1,
  basePeriod: number = 1
): { x: number; y: number; z: number } {
  const pos = calculateOrbitalPosition(time, elements, basePeriod)
  return {
    x: pos.x * distanceScale,
    y: pos.y * distanceScale,
    z: pos.z * distanceScale
  }
}

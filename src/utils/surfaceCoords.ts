/**
 * 地表坐标相关工具函数
 */
import * as THREE from 'three';
import { equatorialToHorizontal, buildENUBasis } from './astronomy';

/**
 * 计算太阳在天空中的位置（高度角和方位角）
 * @deprecated 使用 astronomy.ts 的 sunEclipticHigh + eclipticToEquatorial + equatorialToHorizontal
 * @param latitude 纬度（弧度）
 * @param longitude 经度（弧度），影响地方时角
 * @param dayTime 一天中的时间（0-1，0表示午夜，0.5表示正午）
 * @param yearProgress 年份进度（0-1，0表示年初，1表示年末）
 * @param axialTilt 轴倾角（弧度），默认值为 0.33（~19°，设定推导：回归线比地球更狭窄）
 * @returns { altitude: number, azimuth: number } 高度角和方位角（弧度）
 */
export function calculateSunSkyPosition(
  latitude: number, 
  longitude: number,
  dayTime: number, 
  yearProgress: number,
  axialTilt: number = 0.33
): { altitude: number, azimuth: number } {
  // 时角 = 日进度转换 + 经度偏移（不同经度看太阳位置不同）
  const hourAngle = (dayTime - 0.5) * Math.PI * 2 + longitude;
  // 太阳赤纬：轴倾角 × sin(2π × yearProgress)，春分(yearProgress=0)时 declination=0
  const declination = axialTilt * Math.sin(yearProgress * 2 * Math.PI);

  // 计算高度角
  const sinAltitude = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(sinAltitude);

  // 计算方位角
  const cosAzimuth = (Math.sin(declination) - sinAltitude * Math.sin(latitude)) / (Math.cos(altitude) * Math.cos(latitude));
  const azimuth = Math.acos(cosAzimuth);

  // 根据时角调整方位角象限
  return {
    altitude,
    azimuth: hourAngle < 0 ? azimuth : 2 * Math.PI - azimuth
  };
}

/**
 * 将高度角和方位角转换为方向向量
 * @param altitude 高度角（弧度）
 * @param azimuth 方位角（弧度）
 * @returns THREE.Vector3 方向向量
 */
export function altAzToDirection(altitude: number, azimuth: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(altitude),
    Math.sin(altitude),
    Math.cos(azimuth) * Math.cos(altitude)
  );
}

/**
 * 将世界坐标转换为天空方向（相对于观测者）
 * @param worldPos 世界坐标
 * @param observerPos 观测者位置
 * @returns THREE.Vector3 方向向量（归一化）
 */
export function worldToSkyDirection(worldPos: THREE.Vector3, observerPos: THREE.Vector3): THREE.Vector3 {
  return worldPos.clone().sub(observerPos).normalize();
}

/**
 * 应用大气折射修正
 * @param altitude 原始高度角（弧度）
 * @param coefficient 折射系数（0.1°~2.0°）
 * @returns 修正后的高度角（弧度）
 */
export function applyAtmosphericRefraction(
  altitude: number, 
  coefficient: number
): number {
  // 将系数转换为弧度
  const R = coefficient * (Math.PI / 180);
  
  // 当高度角接近地平线时（小于15°），应用完整折射修正
  if (altitude < Math.PI/12) { // 15° = π/12
    return altitude + R * Math.tan(Math.PI/2 - altitude);
  }
  
  // 对于较高位置的天体，使用简化公式
  return altitude + R * Math.cos(altitude);
}

export { equatorialToHorizontal }

/**
 * 将天体世界坐标转换为地表观测点的天空方位（高度角+方位角）
 * 
 * 计算链路：开普勒轨道 → 天体世界坐标 → 相对观测点方向 → 行星自转矩阵 → 局部坐标系 → 高度角/方位角
 * 
 * @param worldPos 天体的世界坐标（从开普勒轨道计算得出）
 * @param planetCenterPos 观测行星中心的世界坐标
 * @param planetAxialTilt 行星轴倾角（弧度）
 * @param planetRotationAngle 行星自转角（弧度，从 epoch 开始累积）
 * @param latitude 观测点纬度（弧度）
 * @param longitude 观测点经度（弧度）
 * @param planetRadius 行星半径（默认1.9）
 * @returns { altitude: number, azimuth: number } 高度角和方位角（弧度），altitude < 0 表示地平线以下
 */
export function worldToSkyPosition(
  worldPos: THREE.Vector3,
  planetCenterPos: THREE.Vector3,
  planetAxialTilt: number,
  planetRotationAngle: number,
  latitude: number,
  longitude: number,
  planetRadius: number = 1.9
): { altitude: number, azimuth: number } {
  // === 第1-4步：计算观测点表面坐标 + 构建 ENU 局部坐标系（共享函数） ===
  // 先算表面位置（用于后续相对方向计算）
  const cosLat = Math.cos(latitude);
  const sinLat = Math.sin(latitude);
  const cosLon = Math.cos(longitude);
  const sinLon = Math.sin(longitude);
  const cosRot = Math.cos(planetRotationAngle);
  const sinRot = Math.sin(planetRotationAngle);
  const cosTilt = Math.cos(planetAxialTilt);
  const sinTilt = Math.sin(planetAxialTilt);

  const rotX = planetRadius * cosLat * sinLon * cosRot + planetRadius * cosLat * cosLon * sinRot;
  const rotY = planetRadius * sinLat;
  const rotZ = -planetRadius * cosLat * sinLon * sinRot + planetRadius * cosLat * cosLon * cosRot;
  const worldX = rotX;
  const worldY = rotY * cosTilt - rotZ * sinTilt;
  const worldZ = rotY * sinTilt + rotZ * cosTilt;

  const surfacePos = new THREE.Vector3(
    planetCenterPos.x + worldX,
    planetCenterPos.y + worldY,
    planetCenterPos.z + worldZ
  );

  // 使用共享的 ENU 构建函数
  const { up, east, north } = buildENUBasis(
    latitude, longitude, planetRotationAngle, planetAxialTilt, planetRadius
  );

  // === 第5步：将天体世界空间方向投影到局部天空坐标系 ===
  const relDir = new THREE.Vector3()
    .subVectors(worldPos, surfacePos)
    .normalize();

  const localEast = relDir.dot(east);
  const localNorth = relDir.dot(north);
  const localUp = relDir.dot(up);

  // === 第6步：计算高度角和方位角 ===
  const altitude = Math.asin(Math.max(-1, Math.min(1, localUp)));
  let azimuth = Math.atan2(localEast, localNorth);
  if (azimuth < 0) azimuth += 2 * Math.PI;

  return { altitude, azimuth };
}

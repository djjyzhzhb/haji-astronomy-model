/**
 * 地表坐标相关工具函数
 */
import * as THREE from 'three';
import { calculateSunDeclination } from './calendar';

/**
 * 计算太阳在天空中的位置（高度角和方位角）
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
  const declination = calculateSunDeclination(yearProgress, axialTilt);

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

/**
 * 将赤道坐标转换为地平坐标
 * @param ra 赤经（弧度）
 * @param dec 赤纬（弧度）
 * @param lat 观测点纬度（弧度）
 * @param lon 观测点经度（弧度）
 * @param lst 地方恒星时（弧度）
 * @returns [方位角, 高度角]（弧度）
 */
export function equatorialToHorizontal(
  ra: number,
  dec: number,
  lat: number,
  lon: number,
  lst: number
): [number, number] {
  // 计算时角
  const HA = lst - ra;
  
  // 计算高度角
  const sinAlt = Math.sin(dec) * Math.sin(lat) + 
                Math.cos(dec) * Math.cos(lat) * Math.cos(HA);
  const altitude = Math.asin(sinAlt);
  
  // 计算方位角
  const cosAz = (Math.sin(dec) - Math.sin(altitude) * Math.sin(lat)) / 
               (Math.cos(altitude) * Math.cos(lat));
  const azimuth = Math.acos(cosAz);
  
  // 根据时角确定方位角象限
  return [Math.sin(HA) < 0 ? azimuth : 2 * Math.PI - azimuth, altitude];
}

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
  // === 第1步：计算观测点在行星表面的世界坐标 ===
  // 观测点在行星局部坐标（Y轴为自转轴，X-Z平面为赤道面）
  // longitude: 0° = +Z方向, 90° = +X方向
  const cosLat = Math.cos(latitude);
  const sinLat = Math.sin(latitude);
  const cosLon = Math.cos(longitude);
  const sinLon = Math.sin(longitude);

  const localX = planetRadius * cosLat * sinLon;  // 东西方向
  const localY = planetRadius * sinLat;             // 南北方向（极轴）
  const localZ = planetRadius * cosLat * cosLon;   // 前后方向

  // === 第2步：应用行星自转和轴倾角，将局部坐标转换为世界坐标 ===
  // 自转矩阵：绕Y轴旋转 planetRotationAngle
  // 轴倾角矩阵：绕X轴旋转 planetAxialTilt
  const cosRot = Math.cos(planetRotationAngle);
  const sinRot = Math.sin(planetRotationAngle);
  
  // 先绕Y轴自转
  const rotX = localX * cosRot + localZ * sinRot;
  const rotY = localY;
  const rotZ = -localX * sinRot + localZ * cosRot;
  
  // 再绕X轴应用轴倾角
  const cosTilt = Math.cos(planetAxialTilt);
  const sinTilt = Math.sin(planetAxialTilt);
  
  const worldX = rotX;
  const worldY = rotY * cosTilt - rotZ * sinTilt;
  const worldZ = rotY * sinTilt + rotZ * cosTilt;

  // 观测点世界坐标 = 行星中心 + 表面偏移
  const surfacePos = new THREE.Vector3(
    planetCenterPos.x + worldX,
    planetCenterPos.y + worldY,
    planetCenterPos.z + worldZ
  );

  // === 第3步：计算天体相对于观测点的方向向量 ===
  const relDir = new THREE.Vector3()
    .subVectors(worldPos, surfacePos)
    .normalize();

  // === 第4步：构建观测点局部坐标系（东-北-天顶） ===
  // 天顶方向 = 表面法线（从行星中心指向表面）
  const up = new THREE.Vector3(worldX, worldY, worldZ).normalize();
  
  // 东方向 = 自转轴(0,1,0)经过轴倾角旋转后，与天顶方向的叉积
  // 行星自转轴在世界空间中：绕X轴倾斜后的Y轴
  const rotationAxis = new THREE.Vector3(0, cosTilt, sinTilt);
  let east = new THREE.Vector3().crossVectors(rotationAxis, up).normalize();
  
  // 如果观测点在极点附近，东方向退化为任意方向，设为(1,0,0)在切平面上的投影
  if (east.length() < 0.001) {
    east = new THREE.Vector3(1, 0, 0);
    // 投影到切平面
    const dotUp = east.dot(up);
    east.sub(up.clone().multiplyScalar(dotUp)).normalize();
  }
  
  // 北方向 = 天顶 × 东（右手系）
  const north = new THREE.Vector3().crossVectors(up, east).normalize();

  // === 第5步：将世界空间方向转换到局部天空坐标系 ===
  // 局部坐标 = [东·方向, 北·方向, 天顶·方向]
  const localEast = relDir.dot(east);
  const localNorth = relDir.dot(north);
  const localUp = relDir.dot(up);

  // === 第6步：计算高度角和方位角 ===
  // 高度角：相对于水平面的仰角（-90°~90°，负值在地平线以下）
  const altitude = Math.asin(Math.max(-1, Math.min(1, localUp)));
  
  // 方位角：从北方向顺时针测量（0°=北, 90°=东, 180°=南, 270°=西）
  let azimuth = Math.atan2(localEast, localNorth);
  if (azimuth < 0) azimuth += 2 * Math.PI;

  return { altitude, azimuth };
}

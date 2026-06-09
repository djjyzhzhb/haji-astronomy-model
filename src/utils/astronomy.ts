/**
 * astronomy.ts — 天文计算纯函数模块
 *
 * 提供太阳视位置、坐标转换、黄道/天赤道大圆点位生成等功能。
 * 所有计算基于 local-day 时间系统（T 以本地日为单位，春分正午=0）。
 * 采用 Y-up 世界空间约定（Y=天极）。
 */

import * as THREE from 'three';
import {
  D_YEAR,
  D_S,
  EPSILON_RAD,
  ECCENTRICITY,
  A_N_ARCSEC,
  P_N_YEARS,
  DELTA_A_ARCSEC,
  ARCSEC2RAD,
} from '../config/constants';

// ─── 基础数学工具 ────────────────────────────────────────────────────────

/**
 * 确定性哈希函数：将字符串/数字输入映射到 [0, 1) 伪随机值。
 * 基于 xorshift32 变体——每次调用独立，结果完全确定。
 */
export function deterministicHash(seedString: string, salt: number = 0): number {
  let h1 = 2166136261 ^ salt;
  let h2 = 16777619 ^ (salt * 7919);
  for (let i = 0; i < seedString.length; i++) {
    const ch = seedString.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1540483477);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 15), 3266489917);
  const combined = ((h1 >>> 0) + (h2 >>> 0)) >>> 0;
  return combined / 4294967296;  // [0, 1)
}

/** 将角度标准化到 [0, 2π) 范围 */
export function mod2pi(x: number): number {
  const twoPi = 2 * Math.PI;
  return ((x % twoPi) + twoPi) % twoPi;
}

/** 将 x 截断到 [lo, hi]，用于 asin/acos 安全输入 */
export function clip(x: number, lo: number = -1, hi: number = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

// ─── 恒星时计算 ──────────────────────────────────────────────────

/** 格林尼治平恒星时（弧度） */
export function calcGMST(T: number): number {
  return mod2pi((2 * Math.PI) * (T / D_S));
}

/** 地方恒星时（弧度），lonRad 东经为正 */
export function calcLST(T: number, lonRad: number): number {
  return mod2pi(calcGMST(T) + lonRad);
}

// ─── 太阳视黄经（三级精度） ──────────────────────────────────────

/** 低精度太阳视黄经（仅平黄经），弧度 */
export function sunEclipticLow(T: number): number {
  return mod2pi((2 * Math.PI) * T / D_YEAR);
}

/** 中精度太阳视黄经（平黄经 + 中心差），弧度 */
export function sunEclipticMedium(T: number): number {
  const e = ECCENTRICITY;
  const M = (2 * Math.PI) * T / D_YEAR;
  const C = 2 * e * Math.sin(M) + (5 / 4) * e * e * Math.sin(2 * M);
  const L0 = M;
  const lam = L0 + C;
  return mod2pi(lam);
}

/**
 * 高精度太阳视黄经 + 真黄赤交角
 * 返回 [λ, ε′]（弧度），包含章动与光行差修正，不含岁差项。
 */
export function sunEclipticHigh(T: number): [number, number] {
  const e = ECCENTRICITY;
  const M = (2 * Math.PI) * T / D_YEAR;
  const L0 = M;
  const C = 2 * e * Math.sin(M) + (5 / 4) * e * e * Math.sin(2 * M);

  // 章动 Δψ
  const deltaPsi =
    A_N_ARCSEC * ARCSEC2RAD * Math.sin((2 * Math.PI) * T / (P_N_YEARS * D_YEAR));

  // 光行差常数
  const deltaA = DELTA_A_ARCSEC * ARCSEC2RAD;

  // 视黄经
  const lam = mod2pi(L0 + C + deltaPsi - deltaA);

  // 交角章动
  const deltaEpsilon = deltaPsi * Math.cos(EPSILON_RAD);

  // 真黄赤交角
  const epsPrime = EPSILON_RAD + deltaEpsilon;

  return [lam, epsPrime];
}

// ─── 坐标转换 ────────────────────────────────────────────────────

/**
 * 黄道坐标 → 赤道坐标
 * @param lam  黄经（弧度）
 * @param beta 黄纬（弧度）
 * @param epsPrime 真黄赤交角（弧度）
 * @returns [α, δ]（弧度）
 */
export function eclipticToEquatorial(
  lam: number,
  beta: number,
  epsPrime: number,
): [number, number] {
  const sinDelta =
    Math.sin(beta) * Math.cos(epsPrime) +
    Math.cos(beta) * Math.sin(epsPrime) * Math.sin(lam);
  const delta = Math.asin(clip(sinDelta));

  const cosAlphaCosDelta = Math.cos(beta) * Math.cos(lam);
  const sinAlphaCosDelta =
    Math.cos(beta) * Math.sin(lam) * Math.cos(epsPrime) -
    Math.sin(beta) * Math.sin(epsPrime);
  const alpha = mod2pi(Math.atan2(sinAlphaCosDelta, cosAlphaCosDelta));

  return [alpha, delta];
}

/**
 * 赤道坐标 → 地平坐标
 * @param alpha   赤经（弧度）
 * @param delta   赤纬（弧度）
 * @param lst     地方恒星时（弧度）
 * @param phiRad  观测者纬度（弧度）
 * @returns [h, A] — 高度角、方位角（弧度）
 */
export function equatorialToHorizontal(
  alpha: number,
  delta: number,
  lst: number,
  phiRad: number,
): [number, number] {
  const t = lst - alpha;

  const sinH =
    Math.sin(phiRad) * Math.sin(delta) +
    Math.cos(phiRad) * Math.cos(delta) * Math.cos(t);
  const h = Math.asin(clip(sinH));

  const cosA_cosH =
    -Math.sin(phiRad) * Math.cos(delta) * Math.cos(t) +
    Math.cos(phiRad) * Math.sin(delta);
  const sinA_cosH = -Math.cos(delta) * Math.sin(t);
  const A = mod2pi(Math.atan2(sinA_cosH, cosA_cosH));

  return [h, A];
}

// ─── 大圆点位生成 ────────────────────────────────────────────────

/** 黄道大圆在地平坐标系上的 N 个采样点 */
export function generateEclipticPoints(
  T: number,
  lonRad: number,
  phiRad: number,
  N: number = 128,
): { h: number; A: number }[] {
  const [lam, epsPrime] = sunEclipticHigh(T);
  const lst = calcLST(T, lonRad);

  const points: { h: number; A: number }[] = [];

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * 2 * Math.PI;
    const eclipticLam = lam + angle;
    const [ra, dec] = eclipticToEquatorial(eclipticLam, 0, epsPrime);
    const [h, A] = equatorialToHorizontal(ra, dec, lst, phiRad);
    points.push({ h, A });
  }

  return points;
}

/** 天赤道（行星环所在面）在地平坐标系上的 N 个采样点 */
export function generateRingPoints(
  lst: number,
  phiRad: number,
  N: number = 128,
): { h: number; A: number }[] {
  const points: { h: number; A: number }[] = [];

  for (let i = 0; i < N; i++) {
    const alpha = (i / N) * 2 * Math.PI;
    const [h, A] = equatorialToHorizontal(alpha, 0, lst, phiRad);
    points.push({ h, A });
  }

  return points;
}

// ─── 世界方向向量构造 ────────────────────────────────────────────

/**
 * 将地平坐标转为世界空间方向向量
 * @param h     高度角（弧度）
 * @param A     方位角（弧度），A=0 对应北，A=π/2 对应东
 * @param up    天顶方向（ENU 局部坐标系）
 * @param east  东方向
 * @param north 北方向
 * @returns 归一化的世界方向向量
 */
export function horizontalToWorldDir(
  h: number,
  A: number,
  up: THREE.Vector3,
  east: THREE.Vector3,
  north: THREE.Vector3,
): THREE.Vector3 {
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  const cosA = Math.cos(A);
  const sinA = Math.sin(A);

  // 北分量 + 东分量 + 天顶分量
  const dir = new THREE.Vector3()
    .addScaledVector(north, -cosH * cosA)
    .addScaledVector(east, cosH * sinA)
    .addScaledVector(up, sinH);

  return dir.normalize();
}

// ─── ENU 局部坐标系构建 ────────────────────────────────────────────────────────

/**
 * 构建观测点的东-北-天顶（ENU）局部坐标系。
 * 
 * 流程：
 *   1. 在行星局部坐标（Y=自转轴）中计算观测点表面位置
 *   2. 应用自转 + 轴倾角，转换到世界坐标
 *   3. 天顶方向 = 表面法线方向（归一化）
 *   4. 东方向 = rotationAxis × up（自转轴与天顶的叉积）
 *   5. 北方向 = up × east（右手术）
 *   6. 极点退化处理：east ≈ 0 时硬编码 +X 为东并投影到切平面
 *
 * @param latitude           纬度（弧度）
 * @param longitude          经度（弧度）
 * @param planetRotationAngle 行星自转角（弧度，从 epoch 开始累积）
 * @param planetAxialTilt    行星轴倾角（弧度）
 * @param planetRadius       行星半径（任意单位，仅用于方向计算，可使用 1.0）
 * @returns { up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3, position: THREE.Vector3 } 均已归一化，position 为观测者位置（未归一化）
 */
export function buildENUBasis(
  latitude: number,
  longitude: number,
  planetRotationAngle: number,
  planetAxialTilt: number,
  planetRadius: number = 1.0,
): { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3; position: THREE.Vector3 } {
  // 1. 观测点在行星局部坐标（Y=自转轴，X-Z=赤道面，lon=0 对应 +Z）
  const cosLat = Math.cos(latitude);
  const sinLat = Math.sin(latitude);
  const cosLon = Math.cos(longitude);
  const sinLon = Math.sin(longitude);

  const localX = planetRadius * cosLat * sinLon;  // 东西方向
  const localY = planetRadius * sinLat;             // 南北方向（极轴）
  const localZ = planetRadius * cosLat * cosLon;   // 前后方向

  // 2. 应用行星自转（绕 Y 轴）
  const cosRot = Math.cos(planetRotationAngle);
  const sinRot = Math.sin(planetRotationAngle);
  const rotX = localX * cosRot + localZ * sinRot;
  const rotY = localY;
  const rotZ = -localX * sinRot + localZ * cosRot;

  // 3. 应用轴倾角（绕 X 轴）
  const cosTilt = Math.cos(planetAxialTilt);
  const sinTilt = Math.sin(planetAxialTilt);
  const worldX = rotX;
  const worldY = rotY * cosTilt - rotZ * sinTilt;
  const worldZ = rotY * sinTilt + rotZ * cosTilt;

  // 观测者在行星本地坐标系中的位置（表面法线方向 × 半径）
  const position = new THREE.Vector3(worldX, worldY, worldZ);

  // 4. 天顶方向 = 表面法线
  const up = new THREE.Vector3(worldX, worldY, worldZ).normalize();

  // 5. 东方向 = 自转轴（经轴倾角旋转后的 Y 轴）× 天顶
  const rotationAxis = new THREE.Vector3(0, cosTilt, sinTilt);
  let east = new THREE.Vector3().crossVectors(rotationAxis, up).normalize();

  // 6. 极点退化处理：观测点在南北极时 east ≈ 0
  if (east.length() < 0.001) {
    east = new THREE.Vector3(1, 0, 0);
    const dotUp = east.dot(up);
    east.sub(up.clone().multiplyScalar(dotUp)).normalize();
  }

  // 7. 北方向 = 天顶 × 东（右手系）
  const north = new THREE.Vector3().crossVectors(up, east).normalize();

  return { up, east, north, position };
}

/**
 * 将 ENU 局部坐标系旋转到视觉场景坐标系。
 * 视觉场景约定：天顶=+Y，东=+X，北=+Z。
 * ENU 约定（基准态）：天顶=+Z，东=+X，北=+Y。
 * 
 * 变换：绕 X 轴旋转 -π/2（即 ENU up(+Z) → 视觉 up(+Y)，ENU north(+Y) → 视觉 north(+Z)）
 * 
 * @param enuUp     ENU 天顶向量（已归一化）
 * @param enuEast   ENU 东向量（已归一化）
 * @param enuNorth  ENU 北向量（已归一化）
 * @returns { up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3 } 视觉场景基向量（均已归一化）
 */
export function enuToVisualBasis(
  enuUp: THREE.Vector3,
  enuEast: THREE.Vector3,
  enuNorth: THREE.Vector3,
): { up: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3 } {
  // 绕 X 轴旋转 -π/2 的矩阵
  // rotateX(-π/2): Y' = Z, Z' = -Y, X' = X
  const cosA = Math.cos(-Math.PI / 2);  // ≈ 0
  const sinA = Math.sin(-Math.PI / 2);  // ≈ -1

  const rotateY = (y: number, z: number) => y * cosA - z * sinA;  // = z (since cosA≈0, sinA≈-1 → 0*y - (-1)*z = z)
  const rotateZ = (y: number, z: number) => y * sinA + z * cosA;  // = -y (since sinA≈-1, cosA≈0 → (-1)*y + 0*z = -y)

  const visualUp = new THREE.Vector3(
    enuUp.x,
    rotateY(enuUp.y, enuUp.z),
    rotateZ(enuUp.y, enuUp.z),
  ).normalize();

  const visualEast = new THREE.Vector3(
    enuEast.x,
    rotateY(enuEast.y, enuEast.z),
    rotateZ(enuEast.y, enuEast.z),
  ).normalize();

  let visualNorth = new THREE.Vector3(
    enuNorth.x,
    rotateY(enuNorth.y, enuNorth.z),
    rotateZ(enuNorth.y, enuNorth.z),
  ).normalize();

  // 处理 east 退化情况
  if (visualEast.length() < 0.001) {
    // east 退化时重新计算：用 (1,0,0) 投影到切平面
    visualEast.set(1, 0, 0);
    const dotUp = visualEast.dot(visualUp);
    visualEast.sub(visualUp.clone().multiplyScalar(dotUp)).normalize();
    // 重新计算 north
    visualNorth.crossVectors(visualUp, visualEast).normalize();
  }

  return { up: visualUp, east: visualEast, north: visualNorth };
}

/**
 * 将地平坐标转为视觉场景世界空间方向向量。
 * 与 horizontalToWorldDir 逻辑相同，但使用视觉场景基向量。
 * 
 * @param h     高度角（弧度）
 * @param A     方位角（弧度），A=0 对应北，A=π/2 对应东
 * @param visualUp    视觉场景天顶方向
 * @param visualEast  视觉场景东方向
 * @param visualNorth 视觉场景北方向
 * @returns 归一化的视觉场景世界方向向量
 */
export function visualHorizontalToWorldDir(
  h: number,
  A: number,
  visualUp: THREE.Vector3,
  visualEast: THREE.Vector3,
  visualNorth: THREE.Vector3,
): THREE.Vector3 {
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  const cosA = Math.cos(A);
  const sinA = Math.sin(A);

  const dir = new THREE.Vector3()
    .addScaledVector(visualNorth, -cosH * cosA)
    .addScaledVector(visualEast, cosH * sinA)
    .addScaledVector(visualUp, sinH);

  return dir.normalize();
}
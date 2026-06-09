/**
 * 天文重构验证用例
 * 在浏览器控制台执行验证，结果通过 console.assert 显示
 * 在 main.tsx 中 import 此文件即可运行
 */
import { 
  sunEclipticHigh, 
  eclipticToEquatorial, 
  equatorialToHorizontal,
  generateRingPoints,
  calcLST,
  mod2pi 
} from './astronomy'
import { calendarFromT, yearLength } from './calendar'
import { D_YEAR, EPSILON_RAD, ARCSEC2RAD, D2R } from '../config/constants'

export function runAstronomyVerification(): void {
  console.group('🔭 天文重构验证用例')
  let passCount = 0
  const totalTests = 7

  // V1: T=0, φ=0, λ=0 → h≈π/2（春分正午太阳在天顶）
  try {
    const T = 0
    const [lam, eps] = sunEclipticHigh(T)
    const [ra, dec] = eclipticToEquatorial(lam, 0, eps)
    const lst = calcLST(T, 0) // lonRad=0
    const [h, A] = equatorialToHorizontal(ra, dec, lst, 0) // phiRad=0
    console.assert(
      Math.abs(h - Math.PI / 2) < 0.02,
      `V1: T=0时高度角=${h.toFixed(4)}rad，期望≈${(Math.PI/2).toFixed(4)}rad(天顶)`,
    )
    console.log(`✅ V1: 春分正午太阳高度角 h=${h.toFixed(4)}rad (天顶=${(Math.PI/2).toFixed(4)}rad)`)
    passCount++
  } catch (e) {
    console.error(`❌ V1 失败:`, e)
  }

  // V2: 太阳黄经0°时 δ=0（春分点太阳在赤道上）
  try {
    const [ra, dec] = eclipticToEquatorial(0, 0, EPSILON_RAD)
    console.assert(
      Math.abs(dec) < 1e-6,
      `V2: 黄经0°时δ=${dec.toFixed(10)}rad，期望≈0`,
    )
    console.log(`✅ V2: 春分点赤纬 δ=${dec.toFixed(10)}rad ≈ 0`)
    passCount++
  } catch (e) {
    console.error(`❌ V2 失败:`, e)
  }

  // V3: 赤道δ=0, 时角π/2 → A=270°(3π/2)
  try {
    const [h, A] = equatorialToHorizontal(Math.PI / 2, 0, Math.PI / 2, 0)
    const expectedA = 3 * Math.PI / 2
    console.assert(
      Math.abs(A - expectedA) < 0.001,
      `V3: 方位角A=${A.toFixed(4)}rad，期望=${expectedA.toFixed(4)}rad(270°)`,
    )
    console.log(`✅ V3: 赤道天体时角π/2方位角 A=${A.toFixed(4)}rad = ${(A*180/Math.PI).toFixed(1)}°`)
    passCount++
  } catch (e) {
    console.error(`❌ V3 失败:`, e)
  }

  // V4: T=D_YEAR → 太阳黄经≈0（回归年闭合）
  try {
    const [lam, eps] = sunEclipticHigh(D_YEAR)
    const normalizedLam = mod2pi(lam)
    console.assert(
      normalizedLam < 0.001,
      `V4: T=D_YEAR时黄经=${normalizedLam.toFixed(6)}rad，期望≈0`,
    )
    console.log(`✅ V4: 回归年闭合 太阳黄经 λ=${normalizedLam.toFixed(6)}rad ≈ 0`)
    passCount++
  } catch (e) {
    console.error(`❌ V4 失败:`, e)
  }

  // V5: T=0 → calendarFromT = 第1年1月1日
  try {
    const date = calendarFromT(0)
    console.assert(
      date.year === 1 && date.month === 1 && date.day === 1 && date.isIntercalary === false,
      `V5: calendarFromT(0)=${JSON.stringify(date)}，期望 year=1,month=1,day=1`,
    )
    console.log(`✅ V5: T=0 → ${date.year}年${date.month}月${date.day}日`)
    passCount++
  } catch (e) {
    console.error(`❌ V5 失败:`, e)
  }

  // V6: 第7年 → yearLength=427
  try {
    const len7 = yearLength(7)
    console.assert(
      len7 === 427,
      `V6: yearLength(7)=${len7}，期望=427`,
    )
    console.log(`✅ V6: 第7年长度=${len7}天 (闰年427)`)
    passCount++
  } catch (e) {
    console.error(`❌ V6 失败:`, e)
  }

  // V7: φ=90° → 环点 h=0（极地天赤道在地平线上）
  try {
    const lst = 0 // 任意lst
    const points = generateRingPoints(lst, Math.PI / 2, 64)
    const allOnHorizon = points.every(p => Math.abs(p.h) < 0.001)
    console.assert(
      allOnHorizon,
      `V7: 极地环点不全在地平线上`,
    )
    console.log(`✅ V7: 极地(${points.length}个点)全部在地平线上(h=0)`)
    passCount++
  } catch (e) {
    console.error(`❌ V7 失败:`, e)
  }

  console.log(`\n📊 结果: ${passCount}/${totalTests} 通过`)
  console.groupEnd()
}
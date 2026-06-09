// ========== 角度转换辅助 ==========
/** 角度转弧度 */
export const D2R = Math.PI / 180;
/** 角秒转弧度 */
export const ARCSEC2RAD = Math.PI / (180 * 3600);

// ========== 时间与天文基本常数 ==========
/** 回归年（本地日），两次过移动春分点的时间 */
export const D_YEAR = 426.15;
/** 恒星日（本地日），恒星连续两次上中天 */
export const D_S = 0.9976;
/** 一本地日对应的地球秒（设定值：24.15h * 3600s/h） */
export const SECONDS_PER_DAY = 24.15 * 3600; // = 86940 秒

/** 行星自转角速度（弧度/本地日）：假设行星每天自转一圈 */
export const PLANET_ROTATION_RATE = 2 * Math.PI;

// ========== 黄赤交角与轨道 ==========
/** 黄赤交角（度） */
export const EPSILON_DEG = 12.0;
/** 黄赤交角（弧度） */
export const EPSILON_RAD = EPSILON_DEG * Math.PI / 180;
/** 轨道偏心率 */
export const ECCENTRICITY = 0.0167;

// ========== 高精度修正参数 ==========
/** 日月岁差速率（角秒/本地年），仅用于长期估算，不参与视位置计算 */
export const P_ARCSEC_PER_YEAR = 50.3;
/** 章动振幅（角秒） */
export const A_N_ARCSEC = 9.2;
/** 章动周期（本地年） */
export const P_N_YEARS = 18.9;
/** 光行差常数（角秒） */
export const DELTA_A_ARCSEC = 20.5;

// ========== 历法常数（基于 D_YEAR=426.15） ==========
/** 每年月数 */
export const MONTHS_IN_YEAR = 10;
/** 小月天数 */
export const SMALL_MONTH_DAYS = 41;
/** 大月天数 */
export const BIG_MONTH_DAYS = 42;
/** 基础年长：7×41 + 3×42 = 413 */
export const BASE_YEAR_DAYS = 413;
/** 每年固定补日天数 */
export const EXTRA_DAYS_PER_YEAR = 13;
/** 闰年周期（每7年增补1天） */
export const LEAP_YEAR_CYCLE = 7;
/** 月长序列：[小,小,大,小,大,小,小,大,小,小] */
export const MONTH_LENGTHS: readonly number[] = [
  SMALL_MONTH_DAYS,  // 1月: 41
  SMALL_MONTH_DAYS,  // 2月: 41
  BIG_MONTH_DAYS,    // 3月: 42
  SMALL_MONTH_DAYS,  // 4月: 41
  BIG_MONTH_DAYS,    // 5月: 42
  SMALL_MONTH_DAYS,  // 6月: 41
  SMALL_MONTH_DAYS,  // 7月: 41
  BIG_MONTH_DAYS,    // 8月: 42
  SMALL_MONTH_DAYS,  // 9月: 41
  SMALL_MONTH_DAYS,  // 10月: 41
] as const;
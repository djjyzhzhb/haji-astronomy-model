/**
 * 历法计算模块
 * 基于 426.15 天回归年，10个月 + 岁末补日 + 7年一闰
 */
import { 
  BASE_YEAR_DAYS, 
  EXTRA_DAYS_PER_YEAR, 
  LEAP_YEAR_CYCLE, 
  MONTH_LENGTHS 
} from '../config/constants'

/** 历法日期 */
export interface CalendarDate {
  year: number           // 从1开始
  month: number          // 1-10（正常月），11（岁末补日），12（闰日）
  day: number            // 当月内日序号（1-based）
  isIntercalary: boolean // 是否补日/闰日
  dayOfYear: number      // 年内日序号（1-based）
}

/**
 * 判断是否为闰年
 * @param year 年份（从1开始）
 * @returns 是否闰年
 */
export function isLeapYear(year: number): boolean {
  return year % LEAP_YEAR_CYCLE === 0
}

/**
 * 获取指定年份的总天数
 * @param year 年份
 * @returns 总天数（平年426，闰年427）
 */
export function yearLength(year: number): number {
  return BASE_YEAR_DAYS + EXTRA_DAYS_PER_YEAR + (isLeapYear(year) ? 1 : 0)
}

/**
 * 由儒略日 T 计算历法日期（闭式解版本，避免大 T 值时的 while 循环）
 * 
 * 数学原理：
 *   每年基础天数 = BASE_YEAR_DAYS + EXTRA_DAYS_PER_YEAR = 426 天（平年）
 *   闰年（每 LEAP_YEAR_CYCLE=7 年一次）额外 +1 天
 *   前 Y 年累计天数 = 426 * Y + floor(Y / 7)
 *
 * T=0 对应第1年1月1日（春分日）
 * @param T 儒略日（本地日，春分正午=0）
 * @returns 历法日期
 */
export function calendarFromT(T: number): CalendarDate {
  const NORMAL_YEAR = BASE_YEAR_DAYS + EXTRA_DAYS_PER_YEAR  // = 426
  const AVG_DAYS_PER_YEAR = NORMAL_YEAR + 1 / LEAP_YEAR_CYCLE  // ≈ 426.142857

  // 累计到 year 年末的天数（不含 year 年之后，含 year 年）
  const totalDaysUpTo = (y: number) => NORMAL_YEAR * y + Math.floor(y / LEAP_YEAR_CYCLE)

  // 1. 粗估：平均年长期值
  let year = Math.max(1, Math.floor(T / AVG_DAYS_PER_YEAR) + 1)

  // 2. 微调（最多 ±2 步，因为每 7 年最多 1 天偏差）
  while (totalDaysUpTo(year) <= T) year++
  while (year > 1 && totalDaysUpTo(year - 1) > T) year--

  // 3. 计算当年已过天数
  const daysBeforeYear = year > 1 ? totalDaysUpTo(year - 1) : 0
  const remaining = T - daysBeforeYear
  const dayOfYear = Math.floor(remaining) + 1
  
  // 月内分配
  if (dayOfYear <= BASE_YEAR_DAYS) {
    // 在10个正常月内
    let d = dayOfYear
    let month = 1
    for (const daysInMonth of MONTH_LENGTHS) {
      if (d <= daysInMonth) {
        return { year, month, day: d, isIntercalary: false, dayOfYear }
      }
      d -= daysInMonth
      month++
    }
    // 不应该到达这里
    return { year, month: 10, day: d, isIntercalary: false, dayOfYear }
  } else {
    // 在补日期内
    const extraDay = dayOfYear - BASE_YEAR_DAYS
    if (extraDay <= EXTRA_DAYS_PER_YEAR) {
      // 常规补日
      return { year, month: 11, day: extraDay, isIntercalary: true, dayOfYear }
    } else {
      // 闰日（仅闰年）
      return { year, month: 12, day: extraDay - EXTRA_DAYS_PER_YEAR, isIntercalary: true, dayOfYear }
    }
  }
}

// 保留旧函数名作为向后兼容别名（标记废弃）
/** @deprecated 使用 calendarFromT(T) 替代 */
export function calculateDate(yearProgress: number): { year: number, day: number, month: number, dayInYear: number } {
  const result = calendarFromT(yearProgress * 426.15)
  return { year: result.year, day: result.day, month: result.month, dayInYear: result.dayOfYear }
}

/** 保留常量以向后兼容，但值来自 constants.ts */
export const YEAR_DAYS = 426.15 // 修正为真实回归年
export const MONTHS_CONFIG = MONTH_LENGTHS as readonly number[]
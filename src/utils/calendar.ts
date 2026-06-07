export const YEAR_DAYS = 413;

export const MONTHS_CONFIG = [
  41, 41, 41, 41, 41, 41, 41,
  42, 42, 42
];

export function calculateDate(yearProgress: number): { year: number, day: number, month: number, dayInYear: number } {
  const totalDays = YEAR_DAYS;
  const dayInYear = Math.floor(yearProgress * totalDays) + 1;
  let remainingDays = dayInYear;
  let month = 1;

  for (const daysInMonth of MONTHS_CONFIG) {
    if (remainingDays <= daysInMonth) {
      break;
    }
    remainingDays -= daysInMonth;
    month++;
  }

  return {
    year: 1,
    day: remainingDays,
    month,
    dayInYear
  };
}

export function calculateSunDeclination(yearProgress: number, axialTilt: number = 0.33): number {
  return -axialTilt * Math.cos(yearProgress * Math.PI * 2);
}

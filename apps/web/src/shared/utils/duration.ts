/**
 * Formats a duration in hours (decimal) into a human-readable string.
 * Example: 1.25 -> "1 hr and 15 mins"
 * Example: 2.00 -> "2 hrs"
 * Example: 0.50 -> "30 mins"
 */
export function formatDuration(hoursDecimal: number | string): string {
  const totalMinutes = Math.round(Number(hoursDecimal || 0) * 60);
  
  if (totalMinutes === 0) return '0 mins';
  
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  const hrStr = hrs === 1 ? '1 hr' : `${hrs} hrs`;
  const minStr = mins === 1 ? '1 min' : `${mins} mins`;
  
  if (hrs > 0 && mins > 0) {
    return `${hrStr} and ${minStr}`;
  } else if (hrs > 0) {
    return hrStr;
  } else {
    return minStr;
  }
}

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

/**
 * Formats a duration in hours (decimal) into a compact mobile-friendly string.
 * Example: 1.25 -> "1h 15m"
 * Example: 2.00 -> "2h"
 * Example: 0.50 -> "30m"
 */
export function formatCompactDuration(hoursDecimal: number | string): string {
  const totalMinutes = Math.max(0, Math.round(Number(hoursDecimal || 0) * 60));

  if (totalMinutes === 0) return '0m';

  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hrs > 0 && mins > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (hrs > 0) {
    return `${hrs}h`;
  }
  return `${mins}m`;
}

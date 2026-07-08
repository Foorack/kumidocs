import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const UNITS: [number, string][] = [
  [YEAR, "year"],
  [MONTH, "month"],
  [WEEK, "week"],
  [DAY, "day"],
  [HOUR, "hour"],
  [MINUTE, "minute"],
];

/**
 * Format an ISO 8601 timestamp as a relative time string.
 * Returns "Never" for undefined.
 */
function relativeTime(iso?: string): string {
  if (iso === undefined || iso === "") {
    return "Never";
  }
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    return "just now";
  }
  for (const [ms, label] of UNITS) {
    const count = Math.floor(diff / ms);
    if (count >= 1) {
      return `${count} ${label}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

/** Merge classes with Tailwind conflict resolution via clsx + twMerge. */
const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
export { relativeTime };
export default cn;

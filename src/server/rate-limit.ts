/** Per-user in-memory sliding-window rate limiter.
 *
 * No timers. Empty buckets are cleaned up inline during check(). */

interface Bucket {
  /** Monotonically-increasing timestamps of recent requests (ms). */
  timestamps: number[];
}

class RateLimiter {
  private readonly store = new Map<string, Bucket>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  /**
   * @param maxRequests  Max number of requests allowed within the window.
   * @param windowMs     Window duration in milliseconds.
   * @param maxKeys      Bucket cap. The key is the user id, which comes from a
   *                     header, so a caller can invent unlimited identities.
   */
  public constructor(maxRequests: number, windowMs: number, maxKeys = 10_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  /** Drop the least recently added bucket so invented identities cannot grow the map forever. */
  private evictOldest(): void {
    const oldest = this.store.keys().next();
    if (oldest.value !== undefined) {
      this.store.delete(oldest.value);
    }
  }

  /**
   * Check and record a request for the given key (e.g. user id).
   * Returns `true` if the request is allowed, `false` if rate-limited.
   *
   * The check and record happen in a single synchronous pass: if the
   * bucket is under the limit, the timestamp is pushed immediately before
   * returning, so no intervening event can observe stale state.
   */
  public check(key: string): boolean {
    const now = Date.now();
    let bucket = this.store.get(key);
    if (bucket === undefined) {
      if (this.store.size >= this.maxKeys) {
        this.evictOldest();
      }
      bucket = { timestamps: [] };
      this.store.set(key, bucket);
    }
    // Drop timestamps outside the sliding window
    const cutoff = now - this.windowMs;
    bucket.timestamps = bucket.timestamps.filter((ts) => ts >= cutoff);

    // Under the limit -- record this request atomically and allow.
    if (bucket.timestamps.length < this.maxRequests) {
      bucket.timestamps.push(now);
      return true;
    }

    return false;
  }
}

export default RateLimiter;

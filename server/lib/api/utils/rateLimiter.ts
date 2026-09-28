/**
 * AttemptRateLimiter — in-memory sliding-window failure tracker for login hardening
 * (docs/10-auth.md). Keys are arbitrary, e.g. `ip:<ip>:<username>` (per-IP-per-username)
 * and `user:<username>` (globally per username).
 */
export class AttemptRateLimiter {
	private attempts = new Map<string, number[]>();

	constructor(
		protected readonly maxAttempts: number,
		protected readonly windowMs: number,
		cleanupIntervalMs: number,
	) {
		const timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
		// Never keep the process alive just for rate-limit bookkeeping.
		timer.unref?.();
	}

	isLimited(key: string): boolean {
		const now = Date.now();
		const attempts = this.freshAttempts(key, now);
		return attempts.length >= this.maxAttempts;
	}

	/** Seconds until the oldest recorded attempt leaves the window. */
	retryAfterSeconds(key: string): number {
		const now = Date.now();
		const oldest = (this.attempts.get(key) ?? []).find((t) => now - t < this.windowMs);
		if (oldest === undefined) return 0;
		return Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
	}

	recordFailure(key: string): void {
		const now = Date.now();
		const attempts = this.freshAttempts(key, now);
		attempts.push(now);
		this.attempts.set(key, attempts);
	}

	clear(key: string): void {
		this.attempts.delete(key);
	}

	private freshAttempts(key: string, now: number): number[] {
		return (this.attempts.get(key) ?? []).filter((t) => now - t < this.windowMs);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, attempts] of this.attempts) {
			const fresh = attempts.filter((t) => now - t < this.windowMs);
			if (fresh.length === 0) this.attempts.delete(key);
			else this.attempts.set(key, fresh);
		}
	}
}

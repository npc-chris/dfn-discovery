type RetryFn<T> = () => Promise<T>;

export class NonRetryableHereError extends Error {
  retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableHereError';
  }
}

export async function withRetry<T>(fn: RetryFn<T>, retries = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof Error && (error as { retryable?: boolean }).retryable === false) {
        throw error;
      }
      attempt += 1;
      if (attempt > retries) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('HERE request failed after retries');
}

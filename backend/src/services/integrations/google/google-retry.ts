type RetryFn<T> = () => Promise<T>;

export class NonRetryableGoogleError extends Error {
  retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableGoogleError';
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
      // Exponential backoff: 100ms, 200ms, 400ms...
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 100));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Google request failed after retries');
}

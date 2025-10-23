import type { Model } from './model'

/**
 * TTL (Time To Live) Manager
 * Manages automatic cleanup of expired documents based on TTL indexes
 */
export class TTLManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Register a TTL index for automatic cleanup
   * @param model - The model to monitor
   * @param field - The field containing the timestamp
   * @param ttlSeconds - Time to live in seconds
   * @param checkIntervalMs - How often to check for expired documents (default: 60 seconds)
   */
  registerTTLIndex<T extends object = Record<string, unknown>>(
    model: Model<T>,
    field: string,
    ttlSeconds: number,
    checkIntervalMs: number = 60000
  ): void {
    const modelName =
      (model as unknown as { _schema?: { constructor?: { name?: string } } })._schema?.constructor
        ?.name || 'UnknownModel'
    const key = `${modelName}_${field}`

    // Clear existing interval if any
    this.unregisterTTLIndex(key)

    // Set up periodic cleanup
    const interval = setInterval(async () => {
      await this.cleanupExpiredDocuments(model, field, ttlSeconds)
    }, checkIntervalMs)

    // Keep Node.js process alive if needed
    if (interval.unref) {
      interval.unref()
    }

    this.intervals.set(key, interval)
  }

  /**
   * Clean up expired documents for a specific field
   */
  private async cleanupExpiredDocuments<T extends object = Record<string, unknown>>(
    model: Model<T>,
    field: string,
    ttlSeconds: number
  ): Promise<void> {
    try {
      const expirationDate = new Date(Date.now() - ttlSeconds * 1000)

      const result = await model.deleteMany({
        [field]: { $lt: expirationDate }
      } as any)

      if (result.deletedCount > 0) {
        console.log(
          `[TTL] Deleted ${result.deletedCount} expired documents (${field} < ${expirationDate.toISOString()})`
        )
      }
    } catch (error) {
      console.error(`[TTL] Error cleaning up expired documents:`, error)
    }
  }

  /**
   * Unregister a TTL index (stop automatic cleanup)
   */
  unregisterTTLIndex(key: string): void {
    const interval = this.intervals.get(key)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(key)
    }
  }

  /**
   * Clean up all TTL intervals (call on disconnect)
   */
  cleanup(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval)
    }
    this.intervals.clear()
  }

  /**
   * Get the number of active TTL indexes
   */
  getActiveCount(): number {
    return this.intervals.size
  }
}

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private hasReportedConnectionError = false;
  readonly client: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.client = null;
      return;
    }
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.client.on('error', (error: Error) => {
      if (this.hasReportedConnectionError) return;
      this.hasReportedConnectionError = true;
      this.logger.warn(`Redis connection unavailable: ${error.message}`);
    });
    this.client.on('ready', () => {
      this.hasReportedConnectionError = false;
    });
    this.client.connect().catch(() => {
      /* fail-open later */
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, ttlSec, value);
    } catch {
      /* fail open */
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      /* ignore */
    }
  }

  async xadd(stream: string, fields: Record<string, string>): Promise<string | null> {
    if (!this.client) return null;
    try {
      const args: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, v);
      }
      return await this.client.xadd(stream, '*', ...args);
    } catch {
      return null;
    }
  }
}

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private memory = new Map<string, { value: string; exp: number }>();
  private readonly production: boolean;

  constructor(private config: ConfigService) {
    this.production = this.config.get<string>('NODE_ENV') === 'production';
    const url =
      this.config.get<string>('REDIS_URL') ??
      (this.production ? undefined : 'redis://localhost:6379');
    if (!url) throw new Error('REDIS_URL is required in production.');

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        connectTimeout: 5000,
        retryStrategy: (attempt) =>
          attempt >= 3 ? null : Math.min(attempt * 250, 1000),
      });
      this.client.on('error', () => {});
    } catch (error) {
      if (this.production) throw error;
      this.client = null;
    }
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.client.connect();
    } catch {
      if (this.production) {
        throw new Error('Redis connection is required in production.');
      }
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds: number) {
    if (this.client) {
      try {
        await this.client.set(key, value, 'EX', ttlSeconds);
        return;
      } catch {
        if (this.production) {
          throw new ServiceUnavailableException('Redis is unavailable.');
        }
      }
    }
    if (this.production) {
      throw new ServiceUnavailableException('Redis is unavailable.');
    }
    this.memory.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
  }

  async get(key: string) {
    if (this.client) {
      try {
        return await this.client.get(key);
      } catch {
        if (this.production) {
          throw new ServiceUnavailableException('Redis is unavailable.');
        }
      }
    }
    if (this.production) {
      throw new ServiceUnavailableException('Redis is unavailable.');
    }
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.exp < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return hit.value;
  }

  async del(key: string) {
    if (this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        if (this.production) {
          throw new ServiceUnavailableException('Redis is unavailable.');
        }
      }
    }
    if (this.production) {
      throw new ServiceUnavailableException('Redis is unavailable.');
    }
    this.memory.delete(key);
  }
}


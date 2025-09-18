import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import Redis from 'ioredis';

export class TestSetup {
  private mongoServer?: MongoMemoryServer;
  private redisServer?: Redis;

  async setupDatabase(): Promise<string> {
    this.mongoServer = await MongoMemoryServer.create();
    return this.mongoServer.getUri();
  }

  async setupRedis(): Promise<Redis> {
    this.redisServer = new Redis({
      host: 'localhost',
      port: 6379,
      db: 15, // Use test database
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 1
    });

    await this.redisServer.flushdb();
    return this.redisServer;
  }

  async teardown(): Promise<void> {
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }

    if (this.redisServer) {
      await this.redisServer.flushdb();
      await this.redisServer.quit();
    }
  }

  async clearDatabase(): Promise<void> {
    if (this.redisServer) {
      await this.redisServer.flushdb();
    }
  }
}

export const testSetup = new TestSetup();
import 'dotenv/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const connection: any = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
      maxRetriesPerRequest: null
    });

export const sslQueue = new Queue('ssl-check', {
  connection
});

export const retry = new Queue('retry', {
  connection
});

export const DownRetry = new Queue('Down-retry', {
  connection
})

export const myQueue = new Queue('results', {
  connection
});
import 'dotenv/config';
import { Queue } from 'bullmq';

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 6379
};

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
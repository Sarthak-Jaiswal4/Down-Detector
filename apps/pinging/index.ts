import 'dotenv/config';
import axios from 'axios';
import express from 'express';
import { prisma } from '@repo/db';
import { Redis } from 'ioredis';
import net from 'net';
import { myQueue, retry } from '@repo/queue';
import client from 'prom-client';
import promBundle from 'express-prom-bundle';
import { Check, User,Monitor } from '../../packages/DB/dist/generated/prisma/client.js';

const Monitor_sub = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
    });

const metricsMiddleware = promBundle({
  includeMethod: true,       // GET, POST etc
  includePath: true,         // /api/users etc
  includeStatusCode: true,   // 200, 404 etc
  includeUp: true,
  customLabels: { app: 'my-node-app' },  // ← shows in dashboard dropdown
  promClient: {
    collectDefaultMetrics: {}  // ← this replaces your manual call
  }
});

const siteUpGauge = new client.Gauge({
  name: 'monitor_site_up',
  help: 'Whether the site is up (1) or down (0)',
  labelNames: ['url', 'type'],
});

const siteLatencyGauge = new client.Gauge({
  name: 'monitor_site_latency_ms',
  help: 'Response latency in ms',
  labelNames: ['url', 'type'],
});

const siteCheckCounter = new client.Counter({
  name: 'monitor_site_checks_total',
  help: 'Total checks performed',
  labelNames: ['url', 'status'],
});

Monitor_sub.subscribe('Update_monitor', () => {
  console.log("some update has been made to monitors")
  update_monitor();
});

const lastPingedMap = new Map<string, number>();
let cachedMonitors: Monitor[] = [];

const update_monitor = async () => {
  try {
    console.log('Fetched again and cleared cached monitors');
    cachedMonitors = await prisma.monitor.findMany({
      where: {
        status: 'UP',
        active: true
      },
    });
  } catch (error) {
    console.log('Error in updating the cached monitor', error);
  }
};
update_monitor();

const running = async () => {
  try {
    cachedMonitors.map(async (e, index) => {
      setTimeout(() => {
        executeIndividualPing(e);
      }, index * 200);
    });
  } catch {
    console.log('Some error has occured');
  }
  setTimeout(running, 10000);
};
running();

setInterval(() => {
  update_monitor();
  console.log(cachedMonitors);
}, 65 * 1000);

async function executeIndividualPing(e: any) {
  try {
    const last_pinged = lastPingedMap.get(e.id) || 0;
    // Extract daily milliseconds for recurring maintenance windows and midnight crossings
    const startDate = e.maintenanceStart ? new Date(e.maintenanceStart) : new Date(NaN);
    const endDate = e.maintenanceEnd ? new Date(e.maintenanceEnd) : new Date(NaN);
    
    const startMs = startDate.getHours() * 3600000 + startDate.getMinutes() * 60000;
    const endMs = endDate.getHours() * 3600000 + endDate.getMinutes() * 60000;
    
    const now = new Date();
    const currentMs = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds();
    
    // If start < end (normal day), must be between them.
    // If start >= end (crosses midnight), must be strictly after start OR strictly before end.
    const is_maintenance: boolean = 
      !isNaN(startMs) && !isNaN(endMs)
        ? startMs < endMs
          ? currentMs >= startMs && currentMs <= endMs
          : currentMs >= startMs || currentMs <= endMs
        : false;
    if (last_pinged == 0 || Date.now() - last_pinged >= e.interval * 1000) {
      lastPingedMap.set(e.id, Date.now());
      const starttime = performance.now();
      try {
        if (e.type == 'HTTP') {
          const response = await axios.get(e.url, { timeout: 10000 });
          const endtime = performance.now();
          const secondsAgo =
            last_pinged === 0 ? 0 : (Date.now() - last_pinged) / 1000;
          console.log(
            `Pinged ${e.url} (latency: ${Math.floor(
              endtime - starttime
            )}ms). Last pinged ${secondsAgo}s ago.`
          );
          if ((response.status >= 200 && response.status < 400) || is_maintenance) {
            siteUpGauge.set({ url: e.url, type: e.type }, 1);
            siteLatencyGauge.set(
              { url: e.url, type: e.type },
              Math.floor(endtime - starttime)
            );
            siteCheckCounter.inc({ url: e.url, status: 'up' });

            const data = {
              monitorId: e.id,
              status: response.status,
              latency: Math.floor(endtime - starttime),
              ok: response.status >= 200 && response.status < 400,
              checkedAt: new Date().toISOString(),
            };
            myQueue.add('result', data);
          } else {
            throw new Error(`Status Code: ${response.status}`);
          }
        } else if (e.type == 'PORT') {
          console.log(`port ${e.url} ${e.port} is being pinged`);
          await new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(5000);
            socket.connect(e.port, e.url);
            let latency;
            socket.on('connect', () => {
              const endtime = performance.now();
              latency = Math.floor(endtime - starttime);

              siteUpGauge.set({ url: e.url, type: e.type }, 1);
              siteLatencyGauge.set({ url: e.url, type: e.type }, latency);
              siteCheckCounter.inc({ url: e.url, status: 'up' });

              const data = {
                monitorId: e.id,
                status: 200,
                latency: latency,
                ok: true,
                checkedAt: new Date().toISOString(),
              };
              myQueue.add('result', data);
              socket.destroy();
              console.log(
                `port ${e.url} ${e.port} pinged successfully with latency of ${latency}`
              );
              resolve(true);
            });
            socket.on('error', () => {
              socket.destroy();
              reject(`Error has occured in connecting with TCP`);
            });
            socket.on('timeout', () => {
              socket.destroy();
              reject('Timeout');
            });
          });
        }
      } catch (error: any) {
        console.log(`Error pinging ${e.url}`);
        const endtime = performance.now();
        const latency = Math.floor(endtime - starttime);
        if (is_maintenance) {
          console.log(`[Maintenance] ${e.url} failed, but silencing alerts.`);
          myQueue.add('result', {
            monitorId: e.id,
            status: 999,
            latency,
            ok: true,
            checkedAt: new Date().toISOString(),
          });
        } else {
          siteUpGauge.set({ url: e.url, type: e.type }, 0);
          siteLatencyGauge.set({ url: e.url, type: e.type }, latency);
          siteCheckCounter.inc({ url: e.url, status: 'down' });

          cachedMonitors = cachedMonitors.filter((ed) => ed.id !== e.id);

          console.log('Added to retry and result queue');
          retry.add(
            'retry',
            {
              monitorid: e.id,
              userid: e.userid,
              url: e.url,
              type: e.type,
              port: e.port,
            },
            {
              attempts: 3,
              backoff: {
                type: 'fixed',
                delay: 10000,
              },
              jobId: `retry-${e.id}`,
            }
          );

          myQueue.add('result', {
            monitorId: e.id,
            status: error.response?.status || 500,
            latency: Math.floor(endtime - starttime),
            ok: false,
            checkedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error: any) {
    console.log('error', error.status);
  }
}

const app = express();

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-type', client.register.contentType);
  const metric = await client.register.metrics();
  res.send(metric);
});

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Pinging service running healthy' });
});

app.listen(3002, () => {
  console.log('pinging app running at 3002 port');
  // Keep alive every 5 minutes
  setInterval(() => {
      axios.get(process.env.PUBLIC_URL || `http://localhost:3002/`).catch(() => {});
  }, 5 * 60 * 1000);
});

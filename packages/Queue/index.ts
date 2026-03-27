import 'dotenv/config';
import axios from 'axios';
import { Job, Worker } from 'bullmq';
import { prisma } from '@repo/db';
import { Redis } from 'ioredis'
import tls from 'tls';
import net from 'net'
import {DownRetry,myQueue,retry,sslQueue,connection} from './queue.js'

const publisher =new Redis({ 
  host: process.env.REDIS_HOST || 'localhost', 
  port: Number(process.env.REDIS_PORT) || 6379 
});

sslQueue.add('daily-ssl-check', {}, {
  repeat: { pattern: '0 0 * * *' }
}).catch(console.error);

let buffer: any[] = [];

const myWorker = new Worker('results', async (job: Job) => {
  const payload = job.data;
  buffer.push(job.data);
  await publisher.publish('ping-updates', JSON.stringify(payload));

  if (buffer.length >= 10) { // Only hit the API once we have 10 results
    const batch = [...buffer];
    buffer = []; // Clear the buffer
    try {
      await fetch(`${process.env.BACKEND_URL}/checks/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });
      console.log(`Saved check for monitor ${payload.monitorId} to db via http-server`);
    } catch (e) {
      console.error('Failed to post check outcome against bulk check api', e);
    }
  }
}, {
  connection,
  concurrency: 10
});

const my_retry_worker = new Worker('retry', async (job: Job) => {
  const { url, monitorid, userid, type, port } = job.data;
  console.log(`Retrying...... ${url}`)
  
  try {
    let isUp = false;
    if (type === 'PORT') {
      isUp=await new Promise((resolve, reject) => {
        const starttime=performance.now()
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.connect(port, url)
        let latency
        socket.on("connect", () => {
          const endtime = performance.now()
          latency = Math.floor(endtime - starttime)
          socket.destroy();
          const data = {
            monitorId: monitorid,
            status: 200,
            latency: latency,
            ok: true,
            checkedAt: new Date().toISOString()
          }
          myQueue.add('result', data)
          console.log("Port recovered",data)
          resolve(true)
        })
        socket.on("error", () => {
          socket.destroy();
          reject(`Error has occured in connecting with TCP`)
        })
        socket.on('timeout', () => {
          socket.destroy();
          reject("Timeout");
        });
      })
    } else {
      const res = await axios.get(url, { timeout: 10000 });
      isUp = res.status < 400;
    }

    if (isUp) {
      console.log(`[Retry Worker] Monitor ${url} recovered!`);
      let data
      try {
        data = await prisma.monitor.update({
          where: { id: monitorid },
          data: { status: 'UP' }
        });
      } catch (error) {
        console.log("Error in updating the status to up in retry worker",error)
        throw new Error("Error in updating the status to up")
      }
      console.log(`status of ${url} is updated to up in retry queue`)

      const repeatableJobs = await retry.getRepeatableJobs();
      const existingJob = repeatableJobs.find(j => j.id === `recovery-${monitorid}`);
      if (existingJob) {
        await retry.removeRepeatableByKey(existingJob.key);
      }

      publisher.publish('Update_monitor', JSON.stringify(data));

      return;
    } else {
      throw new Error("Still Down");
    }
  } catch (error) {
    if (job.attemptsMade >= 2) {
      console.log(`[Retry Worker] Monitor ${url} failed 3 times. Sending email alert.`);

      try {
        await axios.post(`${process.env.BACKEND_URL}/send/email`, {
          data: { monitorid, userid }
        });
      } catch (error) {
        console.log("Error occured in sending mail",error)
      }

      await DownRetry.add('Down-retry', { url, monitorid, userid, type, port }, {
        repeat: { pattern: '*/15 * * * *' }, // Every 15 minute
        jobId: `recovery-${monitorid}`
      });
      return;
    }
    throw error;
  }
}, {
  connection,
  concurrency: 10,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 }
});

export function getSSLExpiry(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const hostname = new URL(url).hostname;

    const socket = tls.connect(443, hostname, { servername: hostname }, () => {
      const cert = socket.getPeerCertificate();
      if (cert && cert.valid_to) {
        const expiryDate = new Date(cert.valid_to).getTime();
        const daysRemaining = Math.ceil((expiryDate - Date.now()) / (1000 * 60 * 60 * 24));
        resolve(daysRemaining);
      } else {
        reject(new Error("No certificate found"));
      }
      socket.end();
    });

    socket.on('error', (err) => reject(err));
    socket.setTimeout(5000, () => {
      socket.end();
      reject(new Error("Timeout reaching SSL port"));
    });
  });
}

const sslWorker = new Worker('ssl-check', async (job) => {
  const monitors = await prisma.monitor.findMany();

  for (const monitor of monitors) {
    try {
      const daysLeft = await getSSLExpiry(monitor.url);

      await prisma.monitor.update({
        where: { id: monitor.id },
        data: {
          sslExpiryDays: daysLeft,
        }
      });

      if (daysLeft <= 7) {
        await axios.post(`${process.env.BACKEND_URL}/send/ssl-alert`, {
          monitorId: monitor.id,
          daysLeft
        });
      }
    } catch (e) {
      console.error(`SSL check failed for ${monitor.url}`);
    }
  }
}, {
  connection,
  concurrency: 1
});

const DownMonitor = new Worker('Down-retry', async (job: Job) => {
  const { url, monitorid, userid, type, port } = job.data;
  console.log("Retring dead website")
  try {
    let isRecovered = false;

    if (type === 'PORT') {
      isRecovered=await new Promise((resolve, reject) => {
        const starttime=performance.now()
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.connect(port, url)
        let latency
        socket.on("connect", () => {
          const endtime = performance.now()
          latency = Math.floor(endtime - starttime)
          socket.destroy();
          const data = {
            monitorId: monitorid,
            status: 200,
            latency: latency,
            ok: true,
            checkedAt: new Date().toISOString()
          }
          myQueue.add('result', data)
          resolve(true)
        })
        socket.on("error", () => {
          socket.destroy();
          reject(`Error has occured in connecting with TCP`)
        })
        socket.on('timeout', () => {
          socket.destroy();
          reject("Timeout");
        });
      })
    } else {
      const response = await axios.get(url, { timeout: 10000 });
      isRecovered = response.status >= 200 && response.status < 400;
    }

    if (isRecovered) {
      console.log(`[Recovery Worker] SUCCESS: ${url} has recovered!`);

      let updatedMonitor
      try {
        updatedMonitor = await prisma.monitor.update({
          where: { id: monitorid },
          data: { status: 'UP' }
        });
      } catch (error:any) {
        console.log(`Error in updating the status of the ${url}`,error)
        throw new Error("Error in updating",error)
      }

      await publisher.publish('Update_monitor', JSON.stringify(updatedMonitor));

      try {
        await axios.post(`${process.env.BACKEND_URL}/send/recovery-email`, { data: { monitorid, userid } });
      } catch (error) {
        console.log("Unable to send the Recovery mail",error)
        throw new Error("Error in sending recovered email")
      }

      if (job.repeatJobKey) {
        await DownRetry.removeRepeatableByKey(job.repeatJobKey);
        console.log(`[Recovery Worker] Stopped repeatable checks for ${url}`);
      }
      return "Recovered";
    }

  } catch (error) {
    console.log(`[Recovery Worker] ${url} is still down. Will check again in the next cycle.`,error);
  }
}, {
  connection,
  concurrency: 5
});
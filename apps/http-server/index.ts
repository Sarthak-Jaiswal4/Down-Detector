import 'dotenv/config';
import axios from 'axios'
import express, { Request, Response, NextFunction } from 'express'
import { prisma } from '@repo/db'
import { loginSchema, monitorSchema, signupSchema, bulkCheckSchema } from './types/types.js'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import { Resend } from 'resend';
import { Redis } from 'ioredis'
import type { Monitor } from '../../packages/DB/generated/prisma/client.js'
import net from 'net'
import {myQueue,retry} from '@repo/queue'
import client from 'prom-client'
import promBundle from 'express-prom-bundle';

const resend = new Resend(process.env.Resend_API);
const JWT_SECRET = (process.env.JWT_SECRET || 'secret') as string;

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

const Monitor_publisher = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 6379
});

const Monitor_sub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 6379
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
    update_monitor()
})

export interface AuthRequest extends Request {
    userId?: string;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET as string) as any;
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
        return;
    }
};

const app = express()
app.use(cors())
app.use(metricsMiddleware);
app.use(express.json())

// const sample:Monitor={
//     interval: 10, // 5 second interval for fast testing
//     status: 'UP',
//     userid: "d438964b-3a96-4179-86b7-72f01745156e",
//     url: "https://httpbin.org/status/504", 
//     type: 'HTTP',
//     id:'5cbdbd35-6053-4fd6-a47d-79e1c507d7a5',
//     maintenanceEnd:null,
//     maintenanceStart:null,
//     port:null,
// }

const lastPingedMap = new Map<string, number>();
let cachedMonitors: Monitor[] = [];
const update_monitor = async () => {
    try {
        console.log("Fecthed again and cleared cached monitors")
        cachedMonitors = await prisma.monitor.findMany({
            where: {
                status: 'UP'
            }
        })
    } catch (error) {
        console.log("Error in updating the cached monitor", error)
    }
}
update_monitor()
const running = async () => {
    try {
        cachedMonitors.map(async (e, index) => {
            setTimeout(() => {
                executeIndividualPing(e);
            }, index * 200);
        })
    } catch {
        console.log("Some error has occured")
    }
    setTimeout(running, 10000);
}
running()

setInterval(() => {
    update_monitor()
    console.log(cachedMonitors)
}, 65*1000);

async function executeIndividualPing(e: any) {
    try {
        const last_pinged = lastPingedMap.get(e.id) || 0;
        const start = Number(e.maintenanceStart);
        const end = Number(e.maintenanceEnd);
        const now = new Date();
        const currentUtcMs = (now.getUTCHours() * 3600000) +
            (now.getUTCMinutes() * 60000) +
            (now.getUTCSeconds() * 1000) +
            now.getUTCMilliseconds();
        const is_maintenance: boolean = (start && end)
            ? (start < end
                ? (currentUtcMs >= start && currentUtcMs <= end) // Normal window (e.g., 2AM - 4AM)
                : (currentUtcMs >= start || currentUtcMs <= end)) // Over-midnight (e.g., 11PM - 1AM)
            : false;
        if (last_pinged == 0 || Date.now() - last_pinged >= e.interval * 1000) {
            lastPingedMap.set(e.id, Date.now());
            const starttime = performance.now()
            try {
                if (e.type == "HTTP") {
                    const response = await axios.get(e.url, { timeout: 10000 })
                    const endtime = performance.now()
                    const secondsAgo = last_pinged === 0 ? 0 : (Date.now() - last_pinged) / 1000
                    console.log(`Pinged ${e.url} (latency: ${Math.floor(endtime - starttime)}ms). Last pinged ${secondsAgo}s ago.`);
                    if ((response.status >= 200 && response.status < 400) || is_maintenance) {

                        siteUpGauge.set({ url: e.url, type: e.type }, 1);
                        siteLatencyGauge.set({ url: e.url, type: e.type }, Math.floor(endtime - starttime));
                        siteCheckCounter.inc({ url: e.url, status: 'up' });

                        const data = {
                            monitorId: e.id,
                            status: response.status,
                            latency: Math.floor(endtime - starttime),
                            ok: response.status >= 200 && response.status < 400,
                            checkedAt: new Date().toISOString()
                        }
                        myQueue.add('result', data)
                    } else {
                        throw new Error(`Status Code: ${response.status}`);
                    }
                } else if (e.type == "PORT") {
                    console.log(`port ${e.url} ${e.port} is being pinged`)
                    await new Promise((resolve, reject) => {
                        const socket = new net.Socket();
                        socket.setTimeout(5000);
                        socket.connect(e.port, e.url)
                        let latency
                        socket.on("connect", () => {
                            const endtime = performance.now()
                            latency = Math.floor(endtime - starttime)
                            
                            siteUpGauge.set({ url: e.url, type: e.type }, 1);
                            siteLatencyGauge.set({ url: e.url, type: e.type }, latency);
                            siteCheckCounter.inc({ url: e.url, status: 'up' });

                            const data = {
                                monitorId: e.id,
                                status: 200,
                                latency: latency,
                                ok: true,
                                checkedAt: new Date().toISOString()
                            }
                            myQueue.add('result', data)
                            socket.destroy();
                            console.log(`port ${e.url} ${e.port} pinged successfully with latency of ${latency}`)
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
                }
            } catch (error: any) {
                console.log(`Error pinging ${e.url}`)
                const endtime = performance.now();
                const latency = Math.floor(endtime - starttime);
                if (is_maintenance) {
                    console.log(`[Maintenance] ${e.url} failed, but silencing alerts.`);
                    myQueue.add('result', {
                        monitorId: e.id,
                        status: 999,
                        latency,
                        ok: true, // Keep uptime at 100%
                        checkedAt: new Date().toISOString()
                    });
                } else {
                    siteUpGauge.set({ url: e.url, type: e.type }, 0);
                    siteLatencyGauge.set({ url: e.url, type: e.type }, latency);
                    siteCheckCounter.inc({ url: e.url, status: 'down' });

                    cachedMonitors = cachedMonitors.filter((ed) => ed.id !== e.id);

                    console.log("Added to retry and result queue")
                    retry.add('retry', {
                        monitorid: e.id,
                        userid: e.userid,
                        url: e.url,
                        type: e.type,
                        port: e.port
                    }, {
                        attempts: 3,
                        backoff: {
                            type: 'fixed',
                            delay: 10000
                        },
                        jobId: `retry-${e.id}`
                    });

                    myQueue.add('result', {
                        monitorId: e.id,
                        status: error.response?.status || 500,
                        latency: Math.floor(endtime - starttime),
                        ok: false,
                        checkedAt: new Date().toISOString()
                    });
                }
            }
        }
    } catch (error: any) {
        console.log("error", error.status)
    }
}

app.get('/metrics',async (req,res)=>{
    res.setHeader('Content-type',client.register.contentType)
    const metric=await client.register.metrics()
    res.send(metric)
})

app.post('/signin', async (req, res) => {
    try {
        const result = loginSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        const { email, password } = result.data;

        const user = await prisma.user.findUnique({
            where: {
                email
            }
        })

        if (!user || user.password !== password) {
            return res.status(400).json({ "message": "wrong email or password" })
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET);

        return res.status(200).json({ message: "Logged in successfully", token, userId: user.id })

    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.post('/signup', async (req, res) => {
    try {
        const result = signupSchema.safeParse(req.body);
        console.log(result)
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        const { name, email, password } = result.data;

        const createuser = await prisma.user.create({
            data: { name, email, password }
        });

        const token = jwt.sign({ userId: createuser.id }, JWT_SECRET);

        return res.status(201).json({ message: "user created successfully", token, userId: createuser.id });
    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.get('/', (req, res) => {
    res.status(200).json({ message: "Running healthy" })
})

app.post('/create/monitor', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const Data = monitorSchema.safeParse(req.body)

        if (!Data.success) {
            return res.status(400).json({ error: Data.error });
        }

        if (!req.userId) {
            return res.status(400).json({ message: "not Authorized" })
        }

        const data = await prisma.monitor.create({
            data: {
                url: Data.data.url,
                userid: req.userId,
                interval: Data.data.interval,
                type: Data.data.type,
                port: Data.data.type === 'PORT' ? Data.data.port : null,
                createdAt: new Date()
            }
        })

        await Monitor_publisher.publish('Update_monitor', JSON.stringify(data))
        return res.status(201).json({ message: "Monitor created successfully", monitor: data });
    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.get('/monitor/:id/checks', async (req, res) => {
    try {
        const monitorId = req.params.id;
        const checks = await prisma.check.findMany({
            where: { monitorId },
            orderBy: { checkedAt: 'desc' },
            take: 50
        });
        return res.status(200).json({ checks });
    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.get('/user/monitors', authMiddleware, async (req: AuthRequest, res: any) => {
    try {

        if (!req.userId) {
            return res.status(400).json({ message: "not Authorized" })
        }
        const userid = req.userId;

        const monitors = await prisma.monitor.findMany({
            where: { userid },
            include: {
                checks: {
                    orderBy: { checkedAt: 'desc' },
                    take: 1
                }
            }
        });
        return res.status(200).json({ monitors });
    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.post('/checks/bulk', async (req, res) => {
    try {
        const result = bulkCheckSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        const checksData = result.data.map(check => ({
            monitorId: check.monitorId,
            status: check.status,
            latency: check.latency,
            ok: check.ok,
            checkedAt: check.checkedAt ? new Date(check.checkedAt) : new Date()
        }));

        const data = await prisma.check.createMany({
            data: checksData
        });

        return res.status(201).json({ message: "Checks pushed successfully", count: data.count });
    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.post("/send/email", async (req: Request, res: Response): Promise<any> => {
    console.log("sending mail.....")
    try {
        const { monitorid, userid } = req.body.data;

        const user = await prisma.user.findUnique({
            where: { id: userid }
        });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const monitor = await prisma.monitor.findUnique({
            where: { id: monitorid }
        });

        if (!monitor) {
            return res.status(400).json({ message: "Monitor not found" });
        }

        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
                .header { text-align: center; margin-bottom: 24px; }
                .alert-icon { font-size: 48px; line-height: 1; margin-bottom: 16px; }
                .title { color: #f87171; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; }
                .subtitle { color: #a3a3a3; font-size: 16px; margin: 0; }
                .details-box { background-color: #0a0a0a; border: 1px solid #262626; border-radius: 8px; padding: 20px; margin-top: 24px; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #262626; padding-bottom: 12px; }
                .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
                .label { color: #737373; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
                .value { color: #f5f5f5; font-size: 14px; font-weight: 500; word-break: break-all; text-align: right; }
                .value.url { color: #38bdf8; }
                .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #525252; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="alert-icon">⚠️</div>
                    <h1 class="title">Downtime Alert</h1>
                    <p class="subtitle">We've detected an issue with your monitor.</p>
                </div>
                <div class="details-box">
                    <div class="detail-row">
                        <span class="label">Monitor URL</span>
                        <span class="value url">${monitor.url}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Time Detected</span>
                        <span class="value">${new Date().toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Status</span>
                        <span class="value" style="color: #f87171;">Down / Unresponsive</span>
                    </div>
                </div>
                <div class="footer">
                    <p>This is an automated message from your monitoring system.</p>
                </div>
            </div>
        </body>
        </html>
                `;

        const { data, error } = await resend.emails.send({
            from: "Acme <onboarding@resend.dev>",
            to: user.email,
            subject: `🚨 Alert: Your Website ${monitor.url} is Down`,
            html: htmlTemplate,
        });

        const updateDB = await prisma.monitor.update({
            where: { id: monitorid },
            data: { status: 'DOWN' }
        })

        if (error) {
            return res.status(400).json({ error });
        }

        return res.status(200).json({ data });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.post('/send/ssl-alert', async (req, res) => {
    try {
        const { monitorId, daysLeft } = req.body;

        const monitor = await prisma.monitor.findUnique({
            where: { id: monitorId },
            include: { user: true }
        });

        if (!monitor || !monitor.user) {
            return res.status(400).json({ message: "Monitor or User not found" });
        }

        const user = monitor.user;

        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
                .header { text-align: center; margin-bottom: 24px; }
                .alert-icon { font-size: 48px; line-height: 1; margin-bottom: 16px; }
                .title { color: #facc15; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; }
                .subtitle { color: #a3a3a3; font-size: 16px; margin: 0; }
                .details-box { background-color: #0a0a0a; border: 1px solid #262626; border-radius: 8px; padding: 20px; margin-top: 24px; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #262626; padding-bottom: 12px; }
                .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
                .label { color: #737373; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
                .value { color: #f5f5f5; font-size: 14px; font-weight: 500; word-break: break-all; text-align: right; }
                .value.url { color: #38bdf8; }
                .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #525252; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="alert-icon">🔒</div>
                    <h1 class="title">SSL Expiry Warning</h1>
                    <p class="subtitle">The SSL certificate for your website is expiring soon.</p>
                </div>
                <div class="details-box">
                    <div class="detail-row">
                        <span class="label">Monitor URL</span>
                        <span class="value url">${monitor.url}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Days Remaining</span>
                        <span class="value" style="color: #facc15; font-weight: bold;">${daysLeft} days</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Action Required</span>
                        <span class="value">Renew SSL Certificate</span>
                    </div>
                </div>
                <div class="footer">
                    <p>This is an automated message from your monitoring system.</p>
                </div>
            </div>
        </body>
        </html>
                `;

        const { data, error } = await resend.emails.send({
            from: "Acme <onboarding@resend.dev>",
            to: user.email,
            subject: `🔒 Action Required: SSL Expiring Soon for ${monitor.url}`,
            html: htmlTemplate,
        });

        if (error) {
            return res.status(400).json({ error });
        }

        return res.status(200).json({ data });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.post('/send/recovery-email', async (req: Request, res: Response): Promise<any> => {
    try {
        const { monitorid, userid } = req.body.data;

        const user = await prisma.user.findUnique({
            where: { id: userid }
        });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const monitor = await prisma.monitor.findUnique({
            where: { id: monitorid }
        });

        if (!monitor) {
            return res.status(400).json({ message: "Monitor not found" });
        }

        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                .header { text-align: center; margin-bottom: 24px; }
                .alert-icon { font-size: 48px; line-height: 1; margin-bottom: 16px; }
                .title { color: #34d399; font-size: 24px; font-weight: 600; margin: 0 0 8px 0; }
                .subtitle { color: #a3a3a3; font-size: 16px; margin: 0; }
                .details-box { background-color: #0a0a0a; border: 1px solid #262626; border-radius: 8px; padding: 20px; margin-top: 24px; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #262626; padding-bottom: 12px; }
                .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
                .label { color: #737373; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
                .value { color: #f5f5f5; font-size: 14px; font-weight: 500; word-break: break-all; text-align: right; }
                .value.url { color: #38bdf8; }
                .value.ok { color: #34d399; }
                .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #525252; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="alert-icon">✅</div>
                    <h1 class="title">Monitor Recovered</h1>
                    <p class="subtitle">Your service is back online and responding normally.</p>
                </div>
                <div class="details-box">
                    <div class="detail-row">
                        <span class="label">Monitor URL</span>
                        <span class="value url">${monitor.url}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Recovered At</span>
                        <span class="value">${new Date().toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Status</span>
                        <span class="value ok">✓ Online / Operational</span>
                    </div>
                </div>
                <div class="footer">
                    <p>This is an automated message from your monitoring system.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const { data, error } = await resend.emails.send({
            from: "Acme <onboarding@resend.dev>",
            to: user.email,
            subject: `✅ Resolved: ${monitor.url} is back online`,
            html: htmlTemplate,
        });

        if (error) {
            return res.status(400).json({ error });
        }

        return res.status(200).json({ data });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

app.listen(3001, () => {
    console.log("http-server running at 3001 port")
})
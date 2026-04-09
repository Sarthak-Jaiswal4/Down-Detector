import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express'
import { prisma } from '@repo/db'
import { loginSchema, monitorSchema, signupSchema, bulkCheckSchema, updateMonitorSchema, pauseMonitorSchema } from './types/types.js'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import { Resend } from 'resend';
import { Redis } from 'ioredis'
import client from 'prom-client'
import promBundle from 'express-prom-bundle';
import { nanoid } from "nanoid";

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

const Monitor_publisher = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL) 
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379
    });

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
    if (!token) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
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

app.get('/health', (req, res) => {
    res.status(201).json({ message: "Running healthy" })
})

app.get('/health1', (req, res) => {
    res.status(201).json({ message: "Running healthy" })
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

        const slug = `${nanoid(8)}`;

        const data = await prisma.monitor.create({
            data: {
                url: Data.data.url,
                userid: req.userId,
                interval: Data.data.interval,
                type: Data.data.type,
                port: Data.data.type === 'PORT' ? Data.data.port : null,
                title: Data.data.title || null,
                maintenanceStart: Data.data.maintenanceStart || null,
                maintenanceEnd: Data.data.maintenanceEnd || null,
                createdAt: new Date(),
                slug:slug
            }
        })

        await Monitor_publisher.publish('Update_monitor', JSON.stringify(data))
        return res.status(201).json({ message: "Monitor created successfully", monitor: data });
    } catch (error) {
        return res.status(500).json({ error: error });
    }
})

app.put('/update/monitor/:id', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const id = req.params.id as string;
        const payload = updateMonitorSchema.safeParse(req.body);
        if (!payload.success) return res.status(400).json({ error: payload.error });
        if (!req.userId) return res.status(401).json({ message: "Not authorized" });

        const monitor = await prisma.monitor.findUnique({ where: { id } });
        if (!monitor || monitor.userid !== req.userId) return res.status(403).json({ message: "Forbidden" });

        const dataToUpdate: any = { ...payload.data };
        if (payload.data.type === 'HTTP') dataToUpdate.port = null;

        const updated = await prisma.monitor.update({
            where: { id },
            data: dataToUpdate
        });

        await Monitor_publisher.publish('Update_monitor', JSON.stringify(updated));
        return res.status(200).json({ message: "Monitor updated effectively", monitor: updated });
    } catch (error) {
        return res.status(500).json({ error });
    }
});

app.patch('/monitor/:id/pause', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const id = req.params.id as string;
        const payload = pauseMonitorSchema.safeParse(req.body);
        if (!payload.success) return res.status(400).json({ error: payload.error });
        if (!req.userId) return res.status(401).json({ message: "Not authorized" });

        const monitor = await prisma.monitor.findUnique({ where: { id } });
        if (!monitor || monitor.userid !== req.userId) return res.status(403).json({ message: "Forbidden" });

        const updated = await prisma.monitor.update({
            where: { id },
            data: { active: payload.data.active }
        });

        await Monitor_publisher.publish('Update_monitor', JSON.stringify(updated));
        return res.status(200).json({ message: `Monitor ${payload.data.active ? 'resumed' : 'paused'}`, monitor: updated });
    } catch (error) {
        return res.status(500).json({ error });
    }
});

app.delete('/monitor/:id', authMiddleware, async (req: AuthRequest, res: any) => {
    try {
        const id = req.params.id as string;
        if (!req.userId) return res.status(401).json({ message: "Not authorized" });
        const monitor = await prisma.monitor.findUnique({ where: { id } });
        if (!monitor || monitor.userid !== req.userId) return res.status(403).json({ message: "Forbidden" });

        // Prisma lacks native cascade in this schema natively for all relations easily without schema.prisma update, 
        // so we manually clean up incidents then checks.
        await prisma.incident.deleteMany({
            where: { check: { monitorId: id } }
        });
        await prisma.check.deleteMany({
            where: { monitorId: id }
        });
        await prisma.monitor.delete({
            where: { id }
        });

        await Monitor_publisher.publish('Delete_monitor', JSON.stringify({ id }));
        return res.status(200).json({ message: "Monitor deleted successfully" });
    } catch (error) {
        return res.status(500).json({ error });
    }
});

app.get('/monitor/:id/checks', async (req, res) => {
    try {
        const monitorId = req.params.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;

        const [checks, total] = await Promise.all([
            prisma.check.findMany({
                where: { monitorId },
                orderBy: { checkedAt: 'desc' },
                take: limit,
                skip: skip,
                include: { incident: true }
            }),
            prisma.check.count({ where: { monitorId } })
        ]);
        
        return res.status(200).json({ checks, total, page, limit });
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
            where:{
                userid:userid
            },
            select: {
                id: true,
                url: true,
                status: true,
                type: true,
                title: true,
                slug: true,
                createdAt: true,
                active: true,
                interval: true,
                port: true,
                maintenanceStart: true,
                maintenanceEnd: true,
                checks: {
                    take: 50,
                    orderBy: { checkedAt: 'desc' },
                    select: {
                        ok: true
                    }
                },
            }
        });

        // const monitors = await prisma.$queryRaw`
        //     SELECT 
        //         m.id, 
        //         m.url, 
        //         m.status,
        //         (SELECT COUNT(*) FROM "Check" c WHERE c."monitorId" = m.id)::int as "total",
        //         (SELECT COUNT(*) FROM "Check" c WHERE c."monitorId" = m.id AND c.ok = true)::int as "okCount"
        //     FROM "Monitor" m
        //     WHERE m.userid = ${userid}
        // `;

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
    <meta charset="utf-8">
    <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b; padding: 40px 20px; margin: 0; }
        .container { max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 40px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { text-align: center; margin-bottom: 32px; }
        .alert-icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background-color: #fef2f2; border-radius: 100px; font-size: 32px; margin-bottom: 20px; }
        .title { color: #ef4444; font-size: 24px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.025em; }
        .subtitle { color: #71717a; font-size: 15px; margin: 0; line-height: 1.5; }
        .details-box { background-color: #fafafa; border: 1px solid #f4f4f5; border-radius: 12px; padding: 24px; margin-top: 32px; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid #f1f1f2; padding-bottom: 16px; }
        .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
        .label { color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .value { color: #18181b; font-size: 14px; font-weight: 600; word-break: break-all; text-align: right; }
        .value.url { color: #3b82f6; }
        .footer { text-align: center; margin-top: 40px; font-size: 13px; color: #a1a1aa; }
        .footer p { margin: 4px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="alert-icon">🏮</div>
            <h1 class="title">Downtime Alert</h1>
            <p class="subtitle">We've detected an interruption in service for one of your monitored endpoints.</p>
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
                <span class="value" style="color: #ef4444;">🚨 Down / Unreachable</span>
            </div>
        </div>
        <div class="footer">
            <p>This is an automated security notification from Sarthak's Down Detector.</p>
            <p>© 2026 Downtime Monitor. All rights reserved.</p>
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

        // const updateDB = await prisma.monitor.update({
        //     where: { id: monitorid },
        //     data: { status: 'DOWN' }
        // })

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
    <meta charset="utf-8">
    <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b; padding: 40px 20px; margin: 0; }
        .container { max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 40px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { text-align: center; margin-bottom: 32px; }
        .alert-icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background-color: #fffbeb; border-radius: 100px; font-size: 32px; margin-bottom: 20px; }
        .title { color: #f59e0b; font-size: 24px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.025em; }
        .subtitle { color: #71717a; font-size: 15px; margin: 0; line-height: 1.5; }
        .details-box { background-color: #fafafa; border: 1px solid #f4f4f5; border-radius: 12px; padding: 24px; margin-top: 32px; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid #f1f1f2; padding-bottom: 16px; }
        .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
        .label { color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .value { color: #18181b; font-size: 14px; font-weight: 600; word-break: break-all; text-align: right; }
        .value.url { color: #3b82f6; }
        .footer { text-align: center; margin-top: 40px; font-size: 13px; color: #a1a1aa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="alert-icon">🔒</div>
            <h1 class="title">SSL Expiry Warning</h1>
            <p class="subtitle">The SSL certificate for your website is expiring soon. Renew it to avoid security warnings.</p>
        </div>
        <div class="details-box">
            <div class="detail-row">
                <span class="label">Monitor URL</span>
                <span class="value url">${monitor.url}</span>
            </div>
            <div class="detail-row">
                <span class="label">Days Remaining</span>
                <span class="value" style="color: #f59e0b; font-weight: 700;">${daysLeft} days</span>
            </div>
            <div class="detail-row">
                <span class="label">Action Required</span>
                <span class="value">Certificate Renewal</span>
            </div>
        </div>
        <div class="footer">
            <p>Automated security notification from Sarthak's Down Detector.</p>
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
    <meta charset="utf-8">
    <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b; padding: 40px 20px; margin: 0; }
        .container { max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; padding: 40px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .header { text-align: center; margin-bottom: 32px; }
        .alert-icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background-color: #f0fdf4; border-radius: 100px; font-size: 32px; margin-bottom: 20px; }
        .title { color: #10b981; font-size: 24px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.025em; }
        .subtitle { color: #71717a; font-size: 15px; margin: 0; line-height: 1.5; }
        .details-box { background-color: #fafafa; border: 1px solid #f4f4f5; border-radius: 12px; padding: 24px; margin-top: 32px; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid #f1f1f2; padding-bottom: 16px; }
        .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
        .label { color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .value { color: #18181b; font-size: 14px; font-weight: 600; word-break: break-all; text-align: right; }
        .value.url { color: #3b82f6; }
        .value.ok { color: #10b981; }
        .footer { text-align: center; margin-top: 40px; font-size: 13px; color: #a1a1aa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="alert-icon">✨</div>
            <h1 class="title">Service Recovered</h1>
            <p class="subtitle">Great news! Your service is back online and responding normally.</p>
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
                <span class="value ok">✓ Operational</span>
            </div>
        </div>
        <div class="footer">
            <p>Automated security notification from Sarthak's Down Detector.</p>
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

app.post('/incident',async(req,res)=>{
    try {
        console.log("Saving incident data.....")
        const {report,monitorid,error}=req.body

        const newCheck = await prisma.check.create({
            data: {
                monitorId: monitorid,
                status: 500,
                latency: 0,
                ok: false,
            }
        });

        const incident = await prisma.incident.create({
            data: {
                checkId: newCheck.id,
                dns: report.dns,
                sslDays: typeof report.ssl === 'number' ? report.ssl : null,
                pingLatency: report.ping?.latency && report.ping.latency !== "unknown" ? parseFloat(report.ping.latency) : null,
                hops: report.hops,
                rawError: error,
                failureHop: report.failureHop ? String(report.failureHop) : null,
                failureLocation: report.failureLocation
            }
        });

        await prisma.monitor.update({
            where: { id: monitorid },
            data: { status: 'DOWN' }
        });


        res.status(200).json({message:"incident data saved"});
    } catch (error) {
        console.error("❌ INCIDENT ERROR:", error);
        res.status(500).json({ error: "Failed to create incident",message:error });
    }
})

app.get('/status/:slug',async (req:Request,res:Response)=>{
    try {
        const slug = req.params.slug as string;

        if(!slug){
            return res.status(404).json({message:"No slug found"})
        }

        const monitor = await prisma.monitor.findFirst({
            where:{ slug },
            include:{
                checks:{
                    orderBy:{ checkedAt:'desc' },
                    take: 50,
                    include:{ incident: true }
                }
            }
        })

        if(!monitor){
            return res.status(404).json({message:"Monitor not found"})
        }

        // Calculate uptime percentage from all checks 
        const totalChecks = monitor.checks.length;
        const okChecks = monitor.checks.filter(c => c.ok).length;
        const uptimePercent = totalChecks > 0 ? Math.round((okChecks / totalChecks) * 10000) / 100 : 100;

        // Average latency (only from ok checks)
        const okChecksData = monitor.checks.filter(c => c.ok && c.latency > 0);
        const avgLatency = okChecksData.length > 0 
            ? Math.round(okChecksData.reduce((sum, c) => sum + c.latency, 0) / okChecksData.length)
            : 0;

        // Build daily uptime for last 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const dailyChecks = await prisma.check.groupBy({
            by: ['monitorId'],
            where: {
                monitorId: monitor.id,
                checkedAt: { gte: ninetyDaysAgo }
            },
            _count: { id: true }
        });

        // Get daily data with raw SQL-like grouping via individual queries
        const allChecksFor90Days = await prisma.check.findMany({
            where: {
                monitorId: monitor.id,
                checkedAt: { gte: ninetyDaysAgo }
            },
            select: { checkedAt: true, ok: true },
            orderBy: { checkedAt: 'asc' }
        });

        // Group by day
        const dailyMap = new Map<string, { total: number; ok: number }>();
        for (const c of allChecksFor90Days) {
            const day = c.checkedAt.toISOString().split('T')[0]!;
            const entry = dailyMap.get(day) || { total: 0, ok: 0 };
            entry.total++;
            if (c.ok) entry.ok++;
            dailyMap.set(day, entry);
        }

        const dailyUptime = Array.from(dailyMap.entries()).map(([date, stats]) => ({
            date,
            uptime: stats.total > 0 ? Math.round((stats.ok / stats.total) * 10000) / 100 : 100,
            total: stats.total,
            ok: stats.ok
        }));

        // Recent incidents
        const recentIncidents = monitor.checks
            .filter(c => c.incident)
            .slice(0, 5)
            .map(c => ({
                time: c.checkedAt,
                rawError: c.incident?.rawError,
                failureHop: c.incident?.failureHop,
                failureLocation: c.incident?.failureLocation,
                dns: c.incident?.dns,
                pingLatency: c.incident?.pingLatency
            }));

        res.status(200).json({
            monitor: {
                id: monitor.id,
                url: monitor.url,
                type: monitor.type,
                port: monitor.port,
                status: monitor.status,
                slug: monitor.slug,
                createdAt: monitor.createdAt,
                interval: monitor.interval
            },
            stats: {
                uptimePercent,
                avgLatency,
                totalChecks,
                okChecks
            },
            dailyUptime,
            recentChecks: monitor.checks.slice(0, 20).map(c => ({
                id: c.id,
                status: c.status,
                latency: c.latency,
                ok: c.ok,
                checkedAt: c.checkedAt,
                incident: c.incident
            })),
            recentIncidents
        })
    } catch (error:any) {
        console.log("Error in getting status from slug",error.message)
        res.status(500).json({message:"server error in getting status"})
    }
})

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
app.listen(PORT, () => {
    console.log(`http-server running at ${PORT} port`);
    // Keep alive every 5 minutes
    setInterval(() => {
        fetch(process.env.PUBLIC_URL || `http://localhost:${PORT}/`).catch(() => {});
    }, 5 * 60 * 1000);
})
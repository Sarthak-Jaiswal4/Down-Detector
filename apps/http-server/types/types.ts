import { z } from "zod";

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

export const signupSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
});

export type LoginSchema = z.infer<typeof loginSchema>;
export type SignupSchema = z.infer<typeof signupSchema>;

export const monitorSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('HTTP'),
        url: z.string().url(),
        interval: z.number().int().min(10),
        title: z.string().optional(),
        maintenanceStart: z.string().optional(),
        maintenanceEnd: z.string().optional(),
    }),
    z.object({
        type: z.literal('PORT'),
        url: z.string().min(1), // host
        port: z.number().int().min(1).max(65535),
        interval: z.number().int().min(10),
        title: z.string().optional(),
        maintenanceStart: z.string().optional(),
        maintenanceEnd: z.string().optional(),
    }),
]);

export const updateMonitorSchema = z.object({
    url: z.string().optional(),
    interval: z.number().int().min(10).optional(),
    type: z.enum(['HTTP', 'PORT']).optional(),
    port: z.number().int().min(1).max(65535).optional().nullable(),
    title: z.string().optional(),
    maintenanceStart: z.string().optional().nullable(),
    maintenanceEnd: z.string().optional().nullable()
})

export const pauseMonitorSchema = z.object({
    active: z.boolean()
})

export const checkSchema = z.object({
    monitorId: z.string(),
    status: z.number(),
    latency: z.number(),
    ok: z.boolean(),
    checkedAt: z.string().datetime().optional()
})

export const bulkCheckSchema = z.array(checkSchema);
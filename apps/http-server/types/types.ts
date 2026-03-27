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
    }),
    z.object({
        type: z.literal('PORT'),
        url: z.string().min(1), // host
        port: z.number().int().min(1).max(65535),
        interval: z.number().int().min(10),
    }),
]);

export const checkSchema = z.object({
    monitorId: z.string(),
    status: z.number(),
    latency: z.number(),
    ok: z.boolean(),
    checkedAt: z.string().datetime().optional()
})

export const bulkCheckSchema = z.array(checkSchema);
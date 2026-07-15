import { z } from "zod";
export const updateUserSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100).optional(),
        phone: z.string().min(7).max(20).optional(),
        avatar: z.string().url().optional(),
    }),
});
export const updateUserRoleSchema = z.object({
    body: z.object({
        role: z.enum(["CUSTOMER", "ADMIN", "VENDOR"]),
    }),
});
//# sourceMappingURL=user.validation.js.map
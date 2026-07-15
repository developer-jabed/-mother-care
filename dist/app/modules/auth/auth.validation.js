import { z } from 'zod';
const login = z.object({
    body: z.object({
        email: z.string({ error: 'Email is required' }).email({ error: 'Invalid email' }),
        password: z.string({ error: 'Password is required' }),
    }),
});
const refreshToken = z.object({
    cookies: z.object({
        refreshToken: z.string({ error: 'Refresh token is required' }),
    }),
});
const changePassword = z.object({
    body: z.object({
        oldPassword: z.string({ error: 'Old password is required' }),
        newPassword: z
            .string({ error: 'New password is required' })
            .min(6, { error: 'New password must be at least 6 characters' }),
    }),
});
export const AuthValidation = { login, refreshToken, changePassword };
//# sourceMappingURL=auth.validation.js.map
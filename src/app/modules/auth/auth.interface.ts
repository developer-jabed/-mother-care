import type{ JwtPayload } from '../../helper/jwtHelper.js';
export type ILoginRequest = {
    email: string;
    password: string;
};

export type ILoginResponse = {
    accessToken: string;
    refreshToken: string;
    needPasswordChange: boolean;
};

export type IRefreshTokenResponse = {
    accessToken: string;
};

export type IChangePasswordRequest = {
    oldPassword: string;
    newPassword: string;
};

export type { JwtPayload };
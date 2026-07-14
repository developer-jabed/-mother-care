import httpStatus from 'http-status';
import type { FastifyReply, FastifyRequest } from 'fastify';
import config from '../../config/index.js';
import catchAsync from '../../shared/catchAsync.js';
import { AuthService } from './auth.service.js';
import sendResponse from '../../shared/sendResponse.js';
import type { JwtPayload as AppJwtPayload } from '../../helper/jwtHelper.js';

const ACCESS_TOKEN_COOKIE_OPTIONS = {
    secure: config.node_env === 'production',
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 365 * 24 * 60 * 60, // 1 year, in seconds
};

const REFRESH_TOKEN_COOKIE_OPTIONS = {
    secure: config.node_env === 'production',
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 730 * 24 * 60 * 60, // 2 years, in seconds
};

const loginUser = catchAsync(async (request, reply) => {
    const result = await AuthService.loginUser(request.body as any);
    const { accessToken, refreshToken, ...others } = result;

    reply.setCookie('accessToken', accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
    reply.setCookie('refreshToken', refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Logged in successfully',
        data: others,
    });
});

const refreshToken = catchAsync(async (request, reply) => {
    const token = request.cookies?.refreshToken;

    const result = await AuthService.refreshToken(token as string);

    reply.setCookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Access token generated successfully',
        data: result,
    });
});

const changePassword = catchAsync(async (request, reply) => {
    const user = (request as FastifyRequest & { user: AppJwtPayload }).user;

    await AuthService.changePassword(user, request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Password changed successfully',
    });
});

const getMe = catchAsync(async (request, reply) => {
    const user = (request as FastifyRequest & { user: AppJwtPayload }).user;

    const result = await AuthService.getMe(user);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Profile retrieved successfully',
        data: result,
    });
});

const logout = catchAsync(async (request, reply) => {
    reply.clearCookie('accessToken', { path: '/' });
    reply.clearCookie('refreshToken', { path: '/' });

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Logged out successfully',
    });
});

export const AuthController = {
    loginUser,
    refreshToken,
    changePassword,
    getMe,
    logout,
};
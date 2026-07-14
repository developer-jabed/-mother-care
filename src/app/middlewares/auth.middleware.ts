import httpStatus from 'http-status';
import type { Secret } from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import ApiError from '../errors/api.error.js';
import { jwtHelpers } from '../helper/jwtHelper.js';
import config from '../config/index.js';

const auth = (...roles: string[]) => {
    return async (request: FastifyRequest & { user?: any }, reply: FastifyReply) => {
        const cookies = (request as any).cookies;

        const token =
            request.headers.authorization?.replace('Bearer ', '') ||
            cookies?.accessToken;

        if (!token) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
        }

        const verifiedUser = jwtHelpers.verifyToken(
            token,
            config.jwt.access_secret as Secret
        );

        request.user = verifiedUser;

        if (roles.length && !roles.includes(verifiedUser.role)) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden!');
        }
    };
};

export default auth;
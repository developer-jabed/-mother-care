import bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { jwtHelpers } from '../../helper/jwtHelper.js';
import { ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from './auth.constants.js';
import config from '../../config/index.js';
const loginUser = async (payload) => {
    const { email, password } = payload;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isDeleted) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    if (!user.isActive) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been deactivated');
    }
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (!isPasswordMatched) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
    }
    const jwtPayload = {
        id: String(user.id),
        email: user.email,
        role: user.role,
    };
    const accessToken = jwtHelpers.generateToken(jwtPayload, config.jwt.access_secret, ACCESS_TOKEN_EXPIRES_IN);
    const refreshToken = jwtHelpers.generateToken(jwtPayload, config.jwt.refresh_secret, REFRESH_TOKEN_EXPIRES_IN);
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
    });
    return {
        accessToken,
        refreshToken,
        needPasswordChange: user.needPasswordChange,
    };
};
const refreshToken = async (token) => {
    let decoded;
    try {
        decoded = jwtHelpers.verifyToken(token, config.jwt.refresh_secret);
    }
    catch (error) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
    }
    const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
    if (!user || user.isDeleted) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    if (!user.isActive) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been deactivated');
    }
    const jwtPayload = {
        id: String(user.id),
        email: user.email,
        role: user.role,
    };
    const accessToken = jwtHelpers.generateToken(jwtPayload, config.jwt.access_secret, ACCESS_TOKEN_EXPIRES_IN);
    return { accessToken };
};
const changePassword = async (userPayload, payload) => {
    const { oldPassword, newPassword } = payload;
    const user = await prisma.user.findUnique({
        where: { id: Number(userPayload.id) },
    });
    if (!user || user.isDeleted) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    const isPasswordMatched = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordMatched) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Old password is incorrect');
    }
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'New password cannot be the same as the old password');
    }
    const hashedPassword = await bcrypt.hash(newPassword, Number(config.bcrypt_salt_rounds));
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            needPasswordChange: false,
        },
    });
};
const getMe = async (userPayload) => {
    const user = await prisma.user.findUnique({
        where: { id: Number(userPayload.id) },
        select: {
            id: true,
            email: true,
            role: true,
            isEmailVerified: true,
            needPasswordChange: true,
            isActive: true,
            lastLogin: true,
            createdAt: true,
            adminProfile: true,
            studentProfile: true,
        },
    });
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    return user;
};
export const AuthService = {
    loginUser,
    refreshToken,
    changePassword,
    getMe,
};
//# sourceMappingURL=auth.service.js.map
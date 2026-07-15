import httpStatus from 'http-status';
import ApiError from '../errors/api.error.js';
import { jwtHelpers } from '../helper/jwtHelper.js';
import config from '../config/index.js';
const auth = (...roles) => {
    return async (request, reply) => {
        const cookies = request.cookies;
        const token = request.headers.authorization?.replace('Bearer ', '') ||
            cookies?.accessToken;
        if (!token) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
        }
        const verifiedUser = jwtHelpers.verifyToken(token, config.jwt.access_secret);
        request.user = verifiedUser;
        if (roles.length && !roles.includes(verifiedUser.role)) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden!');
        }
    };
};
export default auth;
//# sourceMappingURL=auth.middleware.js.map
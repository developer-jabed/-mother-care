import jwt from 'jsonwebtoken';
const generateToken = (payload, secret, expiresIn) => {
    return jwt.sign(payload, secret, { expiresIn });
};
const verifyToken = (token, secret) => {
    return jwt.verify(token, secret);
};
export const jwtHelpers = {
    generateToken,
    verifyToken,
};
//# sourceMappingURL=jwtHelper.js.map
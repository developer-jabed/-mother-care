import { prisma } from "../../shared/prisma.js";
import { USER_SEARCHABLE_FIELDS } from "./user.constant.js";
import { buildPaginationMeta, calculatePagination } from "../../helper/paginationHelper.js";
import ApiError from "../../errors/api.error.js";
const getAllUsers = async (filters, paginationQuery) => {
    const { search, role, isActive, isVerified } = filters;
    const pagination = calculatePagination(paginationQuery);
    const andConditions = [];
    if (search) {
        andConditions.push({
            OR: USER_SEARCHABLE_FIELDS.map((field) => ({
                [field]: { contains: search },
            })),
        });
    }
    if (role) {
        andConditions.push({ role });
    }
    if (isActive !== undefined) {
        andConditions.push({ isActive: isActive === "true" });
    }
    if (isVerified !== undefined) {
        andConditions.push({ isVerified: isVerified === "true" });
    }
    const where = andConditions.length > 0 ? { AND: andConditions } : {};
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip: pagination.skip,
            take: pagination.limit,
            orderBy: { [pagination.sortBy]: pagination.sortOrder },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                phone: true,
                role: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        orders: true,
                        reviews: true,
                    },
                },
            },
        }),
        prisma.user.count({ where }),
    ]);
    // ✅ pass total AND pagination separately
    const meta = buildPaginationMeta(total, pagination);
    return { data: users, meta };
};
const getUserById = async (id) => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phone: true,
            role: true,
            isActive: true,
            isVerified: true,
            createdAt: true,
            updatedAt: true,
            addresses: true,
            oauthAccounts: {
                select: {
                    provider: true,
                    createdAt: true,
                },
            },
            _count: {
                select: {
                    orders: true,
                    reviews: true,
                    reactions: true,
                },
            },
        },
    });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    return user;
};
const getMyProfile = async (id) => {
    return getUserById(id);
};
const updateMyProfile = async (id, payload) => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    // strip undefined values — Prisma doesn't accept undefined with exactOptionalPropertyTypes
    const data = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    return prisma.user.update({
        where: { id },
        data,
        select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phone: true,
            role: true,
            isActive: true,
            isVerified: true,
            updatedAt: true,
        },
    });
};
const updateUserRole = async (id, role) => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    return prisma.user.update({
        where: { id },
        data: { role },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
        },
    });
};
const toggleUserStatus = async (id) => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    return prisma.user.update({
        where: { id },
        data: { isActive: !user.isActive },
        select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
        },
    });
};
const deleteUser = async (id) => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    await prisma.user.delete({ where: { id } });
};
export const userService = {
    getAllUsers,
    getUserById,
    getMyProfile,
    updateMyProfile,
    updateUserRole,
    toggleUserStatus,
    deleteUser,
};
//# sourceMappingURL=user.service.js.map
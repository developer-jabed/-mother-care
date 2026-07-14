import type { FastifyInstance } from "fastify";
import { userController } from "./user.controller.js";

import validateRequest from "../../middlewares/validateRequest.js";
import { updateUserSchema, updateUserRoleSchema } from "./user.validation.js";
import { USER_ROLES } from "./user.constant.js";

export default async function userRoutes(fastify: FastifyInstance): Promise<void> {

    fastify.get("/me", {
        // preHandler: auth(USER_ROLES.CUSTOMER, USER_ROLES.ADMIN, USER_ROLES.VENDOR),
        handler: userController.getMyProfile,
    });

    // PATCH /users/me
    fastify.patch("/me", {
        preHandler: [
            // auth(USER_ROLES.CUSTOMER, USER_ROLES.ADMIN, USER_ROLES.VENDOR),
            validateRequest(updateUserSchema),
        ],
        handler: userController.updateMyProfile,
    });

    // ── Admin only ─────────────────────────────────────────────────────────────

    // GET /users
    fastify.get("/", {
        // preHandler: auth(USER_ROLES.ADMIN),
        handler: userController.getAllUsers,
    });

    // GET /users/:id
    fastify.get("/:id", {
        // preHandler: auth(USER_ROLES.ADMIN),
        handler: userController.getUserById,
    });

    // PATCH /users/:id/role
    fastify.patch("/:id/role", {
        preHandler: [
            // auth(USER_ROLES.ADMIN),
            validateRequest(updateUserRoleSchema),
        ],
        handler: userController.updateUserRole,
    });

    // PATCH /users/:id/toggle-status
    fastify.patch("/:id/toggle-status", {
        // preHandler: auth(USER_ROLES.ADMIN),
        handler: userController.toggleUserStatus,
    });

    // DELETE /users/:id
    fastify.delete("/:id", {
        // preHandler: auth(USER_ROLES.ADMIN),
        handler: userController.deleteUser,
    });
}
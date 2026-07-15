import { UserRole } from "@prisma/client";
import config from "../config/index.js";
import { prisma } from "../shared/prisma.js";
import * as bcrypt from "bcryptjs";
export const seedAdmin = async () => {
    try {
        if (!config.admin.email || !config.admin.password) {
            throw new Error("ADMIN_EMAIL or ADMIN_PASSWORD is missing in config.");
        }
        const existingAdmin = await prisma.user.findUnique({
            where: {
                email: config.admin.email,
            },
        });
        if (existingAdmin) {
            console.log("✅ Admin already exists.");
            return;
        }
        const hashedPassword = await bcrypt.hash(config.admin.password, Number(config.bcrypt_salt_rounds) || 10);
        await prisma.$transaction(async (tx) => {
            // Create User
            const user = await tx.user.create({
                data: {
                    email: config.admin.email,
                    password: hashedPassword,
                    role: UserRole.ADMIN,
                    isEmailVerified: true,
                    needPasswordChange: false,
                    isActive: true,
                },
            });
            // Create Admin Profile
            await tx.admin.create({
                data: {
                    userId: user.id,
                    fullName: "System Administrator", // ← Required field
                    phone: "01700000000",
                    designation: "Super Admin",
                    joiningDate: new Date(),
                },
            });
        });
        console.log("🎉 Admin seeded successfully!");
        console.log({
            email: config.admin.email,
            password: config.admin.password,
            role: "ADMIN",
        });
    }
    catch (error) {
        console.error("❌ Failed to seed admin:", error.message);
    }
    finally {
        await prisma.$disconnect();
    }
};
// Run the seeder
seedAdmin();
//# sourceMappingURL=seedAdmin.js.map
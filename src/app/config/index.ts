
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

const config = {
  node_env: process.env.NODE_ENV ?? "development",

  port: Number(process.env.PORT) || 5000,

  database_url: process.env.DATABASE_URL!,

  redis_url: process.env.REDIS_URL!,

  bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  jwt: {
    access_secret: process.env.JWT_ACCESS_SECRET!,
    access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,

    refresh_secret: process.env.JWT_REFRESH_SECRET!,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,

    reset_password_secret: process.env.JWT_RESET_PASSWORD_SECRET!,
    reset_password_expires_in:
      process.env.JWT_RESET_PASSWORD_EXPIRES_IN!,
  },

  admin: {
    email: process.env.ADMIN_EMAIL!,
    password: process.env.ADMIN_PASSWORD!,
  },

  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
};

export default config;

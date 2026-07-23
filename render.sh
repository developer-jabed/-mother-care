set -o errexit

pnpm install --frozen-lockfile

pnpm exec puppeteer browsers install chrome

pnpm prisma generate

pnpm run build

pnpm prisma migrate deploy
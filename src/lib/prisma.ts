import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
    return new PrismaClient()
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined
}

const existingClient = globalForPrisma.prisma
const hasDriveConfig = !!(existingClient as { workspaceDriveConfig?: { findUnique?: unknown } })?.workspaceDriveConfig?.findUnique
const prisma = existingClient && hasDriveConfig
    ? existingClient
    : prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

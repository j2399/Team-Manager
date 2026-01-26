import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { DEFAULT_WORKLOAD_CONFIG, mergeWorkloadConfig, normalizeWorkloadConfig } from '@/lib/workload'
import type { WorkloadConfig } from '@/lib/workload'

export async function GET() {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const record = await prisma.workloadConfig.findUnique({
            where: { workspaceId: user.workspaceId },
            select: { config: true }
        })

        const config = normalizeWorkloadConfig(record?.config as Partial<WorkloadConfig> | undefined)
        return NextResponse.json({ config })
    } catch (error) {
        console.error('Failed to fetch workload config:', error)
        return NextResponse.json({ error: 'Failed to fetch workload config' }, { status: 500 })
    }
}

export async function PUT(request: Request) {
    try {
        const user = await getCurrentUser()
        if (!user || !user.workspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (user.role !== 'Admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        let body: Partial<WorkloadConfig> | null = null
        try {
            body = await request.json()
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        const existing = await prisma.workloadConfig.findUnique({
            where: { workspaceId: user.workspaceId },
            select: { config: true }
        })

        const baseConfig = existing
            ? normalizeWorkloadConfig(existing.config as Partial<WorkloadConfig>)
            : DEFAULT_WORKLOAD_CONFIG

        const mergedConfig = mergeWorkloadConfig(baseConfig, body)
        const normalized = normalizeWorkloadConfig(mergedConfig)

        await prisma.workloadConfig.upsert({
            where: { workspaceId: user.workspaceId },
            create: { workspaceId: user.workspaceId, config: normalized },
            update: { config: normalized }
        })

        return NextResponse.json({ config: normalized })
    } catch (error) {
        console.error('Failed to update workload config:', error)
        return NextResponse.json({ error: 'Failed to update workload config' }, { status: 500 })
    }
}

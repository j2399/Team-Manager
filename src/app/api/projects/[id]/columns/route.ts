import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        
        const boards = await prisma.board.findMany({
            where: { projectId: id },
            include: {
                columns: {
                    orderBy: { order: 'asc' }
    }
}
        })

        // Get all columns from all boards
        const columns = boards.flatMap(board => board.columns)

        return NextResponse.json(columns)
    } catch (error) {
        console.error('Failed to fetch columns:', error)
        return NextResponse.json({ error: 'Failed to fetch columns' }, { status: 500 })
    }
}



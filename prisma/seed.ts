import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding database...')

    // Clean up existing data in correct order to respect foreign keys
    try {
        await prisma.invite.deleteMany()
        await prisma.activityLog.deleteMany()
        await prisma.comment.deleteMany()
        await prisma.task.deleteMany()
        await prisma.push.deleteMany()
        await prisma.column.deleteMany()
        await prisma.board.deleteMany()
        await prisma.project.deleteMany()
        await prisma.user.deleteMany()
        await prisma.subteam.deleteMany()
        console.log('Cleaned up existing data.')
    } catch (e) {
        console.log('Error cleaning data (might be empty):', e)
    }

    // Create Subteams
    const subteamsData = [
        { name: 'Mechanical', color: '#EF4444' },
        { name: 'Electrical', color: '#F59E0B' },
        { name: 'Design', color: '#EC4899' },
        { name: 'Business', color: '#10B981' },
        { name: 'Computer Science', color: '#3B82F6' },
    ]

    const subteams = []
    for (const team of subteamsData) {
        const t = await prisma.subteam.create({ data: team })
        subteams.push(t)
    }
    console.log(`Created ${subteams.length} subteams`)

    const csTeam = subteams.find(t => t.name === 'Computer Science')
    const mechTeam = subteams.find(t => t.name === 'Mechanical')
    const designTeam = subteams.find(t => t.name === 'Design')

    // Create Users
    const users = []
    const userConfigs = [
        { email: 'admin@cornell.edu', name: 'Admin User', role: 'Admin', subteam: csTeam },
        { email: 'lead@cornell.edu', name: 'Team Lead', role: 'Team Lead', subteam: mechTeam },
        { email: 'alice@cornell.edu', name: 'Alice Designer', role: 'Member', subteam: designTeam },
        { email: 'bob@cornell.edu', name: 'Bob Builder', role: 'Member', subteam: mechTeam },
        { email: 'charlie@cornell.edu', name: 'Charlie Coder', role: 'Member', subteam: csTeam },
        { email: 'dave@cornell.edu', name: 'Dave DeVry', role: 'Member', subteam: null },
    ]

    for (const u of userConfigs) {
        const user = await prisma.user.create({
            data: {
                email: u.email,
                name: u.name,
                role: u.role,
                subteams: u.subteam ? { connect: [{ id: u.subteam.id }] } : undefined
            }
        })
        users.push(user)
    }
    console.log(`Created ${users.length} users`)

    // Project Data
    const projectsData = [
        { name: 'Drone', description: 'Autonomous drone development project', lead: users[1] },
        { name: 'Hexapod', description: 'Six-legged walking robot', lead: users[4] },
        { name: 'Design', description: 'General design assets and branding', lead: users[2] },
    ]

    for (const pData of projectsData) {
        // Create Project
        const project = await prisma.project.create({
            data: {
                name: pData.name,
                description: pData.description,
                leadId: pData.lead.id
            }
        })

        // Create Board and Columns
        const board = await prisma.board.create({
            data: {
                name: `${pData.name} Board`,
                projectId: project.id,
                columns: {
                    create: [
                        { name: 'Todo', order: 0 },
                        { name: 'In Progress', order: 1 },
                        { name: 'Review', order: 2 },
                        { name: 'Done', order: 3 },
                    ]
                }
            },
            include: { columns: true }
        })

        const columns = board.columns
        const columnMap = {
            'Todo': columns.find(c => c.name === 'Todo')!.id,
            'In Progress': columns.find(c => c.name === 'In Progress')!.id,
            'Review': columns.find(c => c.name === 'Review')!.id,
            'Done': columns.find(c => c.name === 'Done')!.id,
        }

        // Create Pushes
        const pushes = []
        const today = new Date()

        // Generate 6 pushes: 2 past, 1 current, 3 future
        for (let i = -2; i < 4; i++) {
            const start = new Date(today)
            start.setDate(today.getDate() + (i * 14)) // 2 weeks per push
            const end = new Date(start)
            end.setDate(start.getDate() + 13)

            const pushStatus = i < 0 ? 'Completed' : (i === 0 ? 'Active' : 'Planned')
            const pushColor = ['#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#8B5CF6'][i + 2]

            const push = await prisma.push.create({
                data: {
                    name: `Push ${i + 3} (${pData.name})`,
                    status: pushStatus,
                    startDate: start,
                    endDate: end,
                    projectId: project.id,
                    color: pushColor
                }
            })
            pushes.push(push)
        }

        // Generate Tasks
        // We will create ~50 tasks per project distributed across pushes and backlog
        const taskTitles = [
            'Implement control algorithm', 'Design chassis in CAD', 'Solder PCB components', 'Unit test motor drivers',
            'Write documentation', 'Conduct field test', 'Review safety protocols', 'Update firmware',
            'Optimize battery usage', 'Create marketing materials', 'Fix jitter bug', 'Refactor navigation stack',
            '3D Print prototype parts', 'Order sensors', 'Calibrate IMU', 'Setup CI/CD pipeline',
            'Design landing gear', 'Draft user manual', 'Meeting with stakeholders', 'Research new materials'
        ]

        for (let i = 0; i < 50; i++) {
            const title = taskTitles[Math.floor(Math.random() * taskTitles.length)] + ` ${i + 1}`
            const assignee = users[Math.floor(Math.random() * users.length)]

            // 70% chance to be in a push, 30% backlog
            const inPush = Math.random() > 0.3
            const push = inPush ? pushes[Math.floor(Math.random() * pushes.length)] : null

            // Random column based on push status mostly
            let colName = 'Todo'
            if (push) {
                if (push.status === 'Completed') {
                    colName = Math.random() > 0.1 ? 'Done' : 'Review' // Mostly done
                } else if (push.status === 'Active') {
                    const r = Math.random()
                    colName = r > 0.5 ? 'In Progress' : (r > 0.2 ? 'Todo' : 'Review')
                } else {
                    colName = 'Todo'
                }
            } else {
                colName = Math.random() > 0.8 ? 'In Progress' : 'Todo' // Backlog mostly todo
            }

            const columnId = columnMap[colName as keyof typeof columnMap]

            // Dates based on push or near today
            let start = new Date()
            let end = new Date()
            if (push) {
                start = new Date(push.startDate)
                start.setDate(start.getDate() + Math.floor(Math.random() * 5))
                end = new Date(start)
                end.setDate(start.getDate() + Math.floor(Math.random() * 5) + 1)
            } else {
                start.setDate(today.getDate() + Math.floor(Math.random() * 30) - 10)
                end.setDate(start.getDate() + Math.floor(Math.random() * 10) + 1)
            }

            await prisma.task.create({
                data: {
                    title: title,
                    description: `This is a randomly generated task description for ${title}. It involves doing strictly important things.`,
                    columnId: columnId,
                    pushId: push?.id,
                    assigneeId: assignee.id,
                    startDate: start,
                    endDate: end,
                    requireAttachment: Math.random() > 0.7
                }
            })
        }
        console.log(`Created project ${project.name} with ${pushes.length} pushes and ~50 tasks`)
    }

    // Create default invite code
    try {
        await prisma.invite.create({
            data: {
                token: 'cupi-team-join',
                role: 'Member',
                maxUses: 0, // Infinite
                createdBy: 'system'
            }
        })
    } catch (e) {
        console.log('Invite code already exists or could not be created.')
    }

    console.log('Database seeded successfully!')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })

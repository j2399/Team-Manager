import { api, createLegacyId, fetchMutation } from "@/lib/convex/server"

export async function createTaskInConvex(input: {
    title: string
    projectId: string
    workspaceId: string
    columnId?: string | null
    description?: string
    assigneeId?: string
    assigneeIds?: string[]
    requireAttachment: boolean
    enableProgress: boolean
    progress: number
    pushId?: string
    attachmentFolderId?: string | null
    attachmentFolderName?: string | null
    createdBy: string
    createdByName: string
}) {
    return fetchMutation(api.kanbanAdmin.createTask, {
        taskId: createLegacyId("task"),
        title: input.title,
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        columnId: input.columnId ?? undefined,
        description: input.description,
        assigneeId: input.assigneeId,
        assigneeIds: input.assigneeIds,
        requireAttachment: input.requireAttachment,
        enableProgress: input.enableProgress,
        progress: input.progress,
        pushId: input.pushId,
        attachmentFolderId: input.attachmentFolderId,
        attachmentFolderName: input.attachmentFolderName,
        createdBy: input.createdBy,
        createdByName: input.createdByName,
        now: Date.now(),
    })
}

export async function updateTaskStatusInConvex(
    taskId: string,
    columnId: string,
    workspaceId: string,
    userRole: string,
    changedBy: string,
    changedByName: string
) {
    return fetchMutation(api.kanbanAdmin.updateTaskStatus, {
        taskId,
        columnId,
        workspaceId,
        userRole,
        changedBy,
        changedByName,
        now: Date.now(),
    })
}

export async function updateTaskDetailsInConvex(
    taskId: string,
    workspaceId: string,
    userRole: string,
    changedBy: string,
    changedByName: string,
    input: {
        title?: string
        description?: string | null
        assigneeId?: string | null
        assigneeIds?: string[]
        requireAttachment?: boolean
        enableProgress?: boolean
        progress?: number
        attachmentFolderId?: string | null
        attachmentFolderName?: string | null
    }
) {
    return fetchMutation(api.kanbanAdmin.updateTaskDetails, {
        taskId,
        workspaceId,
        userRole,
        changedBy,
        changedByName,
        now: Date.now(),
        ...input,
    })
}

export async function deleteTaskInConvex(
    taskId: string,
    projectId: string,
    workspaceId: string,
    userRole: string,
    deletedBy: string,
    deletedByName: string
) {
    return fetchMutation(api.kanbanAdmin.deleteTask, {
        taskId,
        projectId,
        workspaceId,
        userRole,
        deletedBy,
        deletedByName,
        now: Date.now(),
    })
}

export async function updateTaskProgressInConvex(
    taskId: string,
    progress: number,
    workspaceId: string,
    userRole: string,
    userId: string,
    forceMoveToReview: boolean
) {
    return fetchMutation(api.kanbanAdmin.updateTaskProgress, {
        taskId,
        progress,
        workspaceId,
        userRole,
        userId,
        forceMoveToReview,
        now: Date.now(),
    })
}

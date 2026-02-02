-- CreateTable
CREATE TABLE "WorkspaceDriveConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "folderId" TEXT,
    "folderName" TEXT,
    "connectedById" TEXT,
    "connectedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceDriveConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceDriveConfig_workspaceId_key" ON "WorkspaceDriveConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceDriveConfig" ADD CONSTRAINT "WorkspaceDriveConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


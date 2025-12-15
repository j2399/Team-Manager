-- Add per-user theme preference (system/light/dark)
ALTER TABLE "User"
ADD COLUMN "themePreference" TEXT NOT NULL DEFAULT 'system';


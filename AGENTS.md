# AGENTS.md - AI Agent Instructions for Team-Manager (CuPI Platform)

## Project Overview

**CuPI Platform** - A team/workspace management platform built with:
- **Framework**: Next.js 16 (App Router)
- **React**: 19.2
- **Backend**: Convex (reactive database + serverless functions)
- **Styling**: Tailwind CSS 4 with Oklch colors
- **Auth**: Discord OAuth
- **State**: Convex for server state, Zustand for client state
- **TypeScript**: Strict mode

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── actions/           # Server Actions (client-to-server)
│   ├── api/               # API Routes (external integrations)
│   └── dashboard/         # Main application pages
├── components/
│   ├── ui/                # Base UI components (shadcn-style)
│   └── [feature components]
├── features/              # Feature-based modules (kanban, projects, dashboard)
└── lib/                   # Utilities
    ├── convex/            # Convex client helpers
    └── utils.ts           # cn(), getInitials()

convex/                     # Convex backend code
├── schema.ts              # Database schema
├── [feature].ts           # Queries and mutations
└── lib.ts                 # Helpers (stripDoc, generateId)
```

## Coding Conventions

### File Naming
- React components: `PascalCase.tsx` (e.g., `TaskCard.tsx`)
- Utilities: `camelCase.ts` (e.g., `auth.ts`)
- Server actions: `kebab-case.ts` (e.g., `create-task.ts`)

### Path Aliases
```typescript
import { cn } from "@/lib/utils"
import { api, fetchQuery } from "@/lib/convex/server"
import { Button } from "@/components/ui/button"
```

### UI Components Pattern
This repo uses **CVA (Class Variance Authority)** for variants:
```typescript
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva("...", {
  variants: {
    variant: {
      default: "...",
      destructive: "...",
      outline: "...",
    },
    size: {
      default: "h-9 px-4",
      sm: "h-8 px-3",
    },
  },
})

// Usage
<Button variant="outline" size="sm">Click me</Button>
```

Use `cn()` utility to merge Tailwind classes (handles conflicts automatically):
```typescript
import { cn } from "@/lib/utils"

<div className={cn("base-class", condition && "conditional-class")} />
```

## Database Patterns

### Convex Queries
**Location**: `convex/[feature].ts`

```typescript
// Query pattern
export const getProjectTasks = query({
  args: {
    projectId: v.string(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_columnId", (q) => q.eq("columnId", args.projectId))
      .collect()
    return tasks.map(stripDoc)  // Removes _id, _creationTime
  },
})
```

### Convex Mutations
```typescript
export const createTask = mutation({
  args: {
    title: v.string(),
    projectId: v.string(),
  },
  handler: async (ctx, args) => {
    const id = generateId("task")  // Creates prefixed ID
    await ctx.db.insert("tasks", {
      id,
      title: args.title,
      createdAt: Date.now(),
    })
    return { id }
  },
})
```

### Key Helpers (convex/lib.ts)
- `stripDoc(doc)` - Removes `_id` and `_creationTime` from Convex docs
- `generateId(prefix)` - Creates IDs like `task_abc123`
- Use validation from `convex/values.ts`

## Server Actions Pattern

**Location**: `src/app/actions/[action-name].ts`

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'

export async function createTask(input: CreateTaskInput) {
  // 1. Validate input
  if (!input.title || !input.projectId) {
    return { error: 'Title and Project are required' }
  }

  // 2. Get current user
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  // 3. Call Convex mutation
  const result = await createTaskInConvex({ ... })

  // 4. Revalidate affected paths
  revalidatePath(`/dashboard/projects/${input.projectId}`)

  return { success: true, task: result }
}
```

## Frontend State

### Convex State (Server Data)
```typescript
import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/server"

// Reactive queries
const tasks = useQuery(api.tasks.getProjectTasks, { projectId })

// Mutations
const createTask = useMutation(api.tasks.create)
```

### Local State
```typescript
import { useState } from "react"

const [isDragging, setIsDragging] = useState(false)
```

## Authentication

- Uses Discord OAuth via `/api/discord/*` routes
- Session managed via HTTP-only cookies
- Get current user: `getCurrentUser()` from `@/lib/auth`
- Protected routes check `user.workspaceId`

## Testing

- Test runner: Node.js built-in `test` module
- Location: `tests/` directory
- Run: `npm run test`

## Running the Project

```bash
npm install
npx convex dev    # Start Convex backend
npm run dev       # Start Next.js dev server
```

## Important Files Reference

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Complete database schema (21 tables) |
| `convex/tasks.ts` | Task queries and mutations |
| `convex/auth.ts` | Session management |
| `src/lib/auth.ts` | Current user resolution |
| `src/lib/utils.ts` | `cn()`, `getInitials()` |
| `src/components/ui/*.tsx` | Base UI components |
| `src/features/kanban/` | Kanban board components |

## What NOT to Do

1. **Don't use `eslint-disable`** unless absolutely necessary
2. **Don't skip TypeScript types** - This project uses strict mode
3. **Don't use `any`** - Define proper types
4. **Don't bypass Convex** - All database operations must go through Convex queries/mutations
5. **Don't hardcode secrets** - Use environment variables (`.env.local`)

## Boundaries

- Don't modify `convex/schema.ts` without understanding the migration strategy
- Don't change auth flow without testing OAuth end-to-end
- Don't add new database tables without running `npx convex deploy`
# CuPI Platform

CuPI is a Next.js workspace platform for project planning, Kanban execution, workload analytics, notifications, and team collaboration.

> This is a fork for testing AI review.

## What It Includes

- Multi-workspace onboarding with invite codes and workspace switching
- Project divisions, pushes, Kanban boards, approvals, comments, and attachments
- Leadership dashboards for workload, activity, and delivery health
- Discord login plus optional Google Drive-backed storage
- Convex-backed persistence with server actions and reactive client queries

## Stack

- Next.js App Router
- React 19
- Convex
- Tailwind CSS
- TypeScript

## Required Environment Variables

Core:

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `APP_URL` or `NEXT_PUBLIC_APP_URL`

Discord auth:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`

Google Drive integration:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (optional if `APP_URL` is set)
- `GOOGLE_DRIVE_TOKEN_SECRET` (recommended; falls back to OAuth client secrets if omitted)

Optional:

- `NEXT_PUBLIC_GIPHY_API_KEY`
- `ENABLE_DEMO_MODE`
- `VERCEL_URL`

## Local Setup

```bash
npm install
npx convex dev
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - start the app locally
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript without emitting files
- `npm run test` - run the automated unit test suite
- `npm run build` - build the app for production
- `npm run convex:dev` - run Convex locally/in watch mode

## Notes

- Convex schema and backend functions live in [`convex/`](./convex).
- Google Drive tokens are stored encrypted before persistence.
- Attachment access is proxied through authenticated routes instead of exposing direct links.
- CI runs lint, typecheck, and tests on every push and pull request.

import { fetchMutation, fetchQuery, preloadQuery, preloadedQueryResult } from "convex/nextjs"
import { api } from "@convex/_generated/api"

export { api, fetchMutation, fetchQuery, preloadQuery, preloadedQueryResult }

export function createLegacyId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`
}

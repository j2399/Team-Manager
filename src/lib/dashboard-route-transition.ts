"use client"

export const DASHBOARD_ROUTE_TRANSITION_START_EVENT = "cupi:dashboard-route-transition-start"

export type DashboardRouteTransitionKind = "dashboard" | "myBoard" | "project"

export type DashboardRouteTransitionDetail = {
    href: string
    kind: DashboardRouteTransitionKind
    path: string
}

function getPathFromHref(href: string) {
    return href.split("?")[0]?.split("#")[0] ?? href
}

export function getDashboardRouteTransitionDetail(href: string): DashboardRouteTransitionDetail | null {
    const path = getPathFromHref(href)

    if (path === "/dashboard") {
        return { href, kind: "dashboard", path }
    }

    if (path === "/dashboard/my-board") {
        return { href, kind: "myBoard", path }
    }

    if (path.startsWith("/dashboard/projects/")) {
        return { href, kind: "project", path }
    }

    return null
}

export function dispatchDashboardRouteTransitionStart(href: string) {
    const detail = getDashboardRouteTransitionDetail(href)
    if (!detail) return

    window.dispatchEvent(
        new CustomEvent<DashboardRouteTransitionDetail>(DASHBOARD_ROUTE_TRANSITION_START_EVENT, {
            detail,
        })
    )
}

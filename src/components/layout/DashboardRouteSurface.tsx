"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import {
    DashboardRouteSkeleton,
    MyBoardRouteSkeleton,
    ProjectRouteSkeleton,
} from "@/components/loading/dashboard-route-skeletons"
import {
    DASHBOARD_ROUTE_TRANSITION_START_EVENT,
    type DashboardRouteTransitionDetail,
} from "@/lib/dashboard-route-transition"

type PendingRouteState = DashboardRouteTransitionDetail & {
    sourcePath: string
}

function renderRouteSkeleton(kind: DashboardRouteTransitionDetail["kind"]) {
    switch (kind) {
        case "dashboard":
            return <DashboardRouteSkeleton />
        case "myBoard":
            return <MyBoardRouteSkeleton />
        case "project":
            return <ProjectRouteSkeleton />
        default:
            return null
    }
}

export function DashboardRouteSurface({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [pendingRoute, setPendingRoute] = useState<PendingRouteState | null>(null)

    useEffect(() => {
        const handleStart = (event: Event) => {
            const detail = (event as CustomEvent<DashboardRouteTransitionDetail>).detail
            if (!detail || detail.path === pathname) return
            setPendingRoute({
                ...detail,
                sourcePath: pathname,
            })
        }

        window.addEventListener(DASHBOARD_ROUTE_TRANSITION_START_EVENT, handleStart)
        return () => {
            window.removeEventListener(DASHBOARD_ROUTE_TRANSITION_START_EVENT, handleStart)
        }
    }, [pathname])

    if (pendingRoute && pathname === pendingRoute.sourcePath && pathname !== pendingRoute.path) {
        return renderRouteSkeleton(pendingRoute.kind)
    }

    return <>{children}</>
}

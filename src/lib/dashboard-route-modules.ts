let dashboardHomeModulePromise: Promise<typeof import("@/app/dashboard/DashboardPageClient")> | null = null
let myBoardModulePromise: Promise<typeof import("@/app/dashboard/my-board/MyBoardPageClient")> | null = null

export function loadDashboardHomeModule() {
    if (!dashboardHomeModulePromise) {
        dashboardHomeModulePromise = import("@/app/dashboard/DashboardPageClient")
    }

    return dashboardHomeModulePromise
}

export function preloadDashboardHomeModule() {
    void loadDashboardHomeModule()
}

export function loadMyBoardModule() {
    if (!myBoardModulePromise) {
        myBoardModulePromise = import("@/app/dashboard/my-board/MyBoardPageClient")
    }

    return myBoardModulePromise
}

export function preloadMyBoardModule() {
    void loadMyBoardModule()
}

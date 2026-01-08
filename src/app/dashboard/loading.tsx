"use client"

export default function DashboardLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5">
                {/* Header Skeleton */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <div className="h-7 w-48 bg-muted rounded-md animate-pulse" />
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-8 bg-muted rounded animate-pulse delay-75" />
                            <div className="h-4 w-8 bg-muted rounded animate-pulse delay-100" />
                            <div className="h-4 w-8 bg-muted rounded animate-pulse delay-150" />
                        </div>
                    </div>
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* My Tasks Skeleton */}
                        <section className="border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 p-2 rounded-md border border-border"
                                        style={{ animationDelay: `${i * 50}ms` }}
                                    >
                                        <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                                        <div className="flex-1 h-4 bg-muted rounded animate-pulse" style={{ width: `${70 - i * 8}%` }} />
                                        <div className="w-12 h-3 bg-muted rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Pending Approval Skeleton */}
                        <section className="border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 p-2 rounded-md border border-border"
                                        style={{ animationDelay: `${(i + 5) * 50}ms` }}
                                    >
                                        <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                                        <div className="flex-1 h-4 bg-muted rounded animate-pulse" style={{ width: `${65 - i * 10}%` }} />
                                        <div className="w-16 h-3 bg-muted rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Work Distribution Skeleton */}
                        <section className="border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="h-4 w-36 bg-muted rounded animate-pulse" />
                                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                                    <div
                                        key={i}
                                        className="p-3 rounded-md bg-muted/30 border border-border animate-pulse"
                                        style={{ animationDelay: `${i * 75}ms` }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-full bg-muted" />
                                            <div className="h-3 flex-1 bg-muted rounded" />
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {[0, 1, 2, 3].map((j) => (
                                                <div key={j} className="h-6 bg-muted/50 rounded" />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-5">
                        {/* Team Skeleton */}
                        <section className="border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 p-2 rounded-md"
                                        style={{ animationDelay: `${i * 60}ms` }}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
                                        <div className="flex-1 h-3 bg-muted rounded animate-pulse" />
                                        <div className="w-16 h-3 bg-muted rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Activity Skeleton */}
                        <section className="border border-border rounded-lg p-4">
                            <div className="h-4 w-28 bg-muted rounded animate-pulse mb-4" />
                            <div className="space-y-2">
                                {[0, 1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 p-1"
                                        style={{ animationDelay: `${i * 80}ms` }}
                                    >
                                        <div className="w-4 h-4 rounded bg-muted animate-pulse" />
                                        <div className="flex-1 h-3 bg-muted rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {/* Shimmer overlay effect */}
            <style jsx>{`
                @keyframes shimmer {
                    0% { opacity: 0.5; }
                    50% { opacity: 1; }
                    100% { opacity: 0.5; }
                }
            `}</style>
        </div>
    )
}

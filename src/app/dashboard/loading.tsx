"use client"

export default function DashboardLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="h-6 w-44 bg-muted rounded animate-pulse" />
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* My Tasks */}
                        <section className="rounded-lg p-4 bg-muted/30">
                            <div className="mb-3">
                                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="h-10 bg-muted rounded animate-pulse"
                                        style={{ animationDelay: `${i * 50}ms` }}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* Work Distribution */}
                        <section className="rounded-lg p-4 bg-muted/30">
                            <div className="h-4 w-32 bg-muted rounded animate-pulse mb-3" />
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                                    <div
                                        key={i}
                                        className="h-20 bg-muted rounded-md animate-pulse"
                                        style={{ animationDelay: `${i * 40}ms` }}
                                    />
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-5">
                        <section className="rounded-lg p-4 bg-muted/30">
                            <div className="h-4 w-16 bg-muted rounded animate-pulse mb-3" />
                            <div className="space-y-2">
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="h-8 bg-muted rounded animate-pulse"
                                        style={{ animationDelay: `${i * 60}ms` }}
                                    />
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

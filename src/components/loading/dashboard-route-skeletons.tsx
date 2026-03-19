export function DashboardRouteSkeleton() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-3 md:p-4 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-6 w-44 bg-muted rounded animate-pulse" />
                </div>

                <section className="rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="space-y-2">
                            <div className="h-4 w-36 bg-muted rounded animate-pulse" />
                            <div className="h-3 w-64 bg-muted rounded animate-pulse" />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className="h-14 w-20 rounded-lg bg-muted animate-pulse"
                                    style={{ animationDelay: `${i * 35}ms` }}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_320px]">
                        <div className="h-56 rounded-lg bg-muted animate-pulse" />
                        <div className="space-y-3">
                            <div className="h-40 rounded-lg bg-muted animate-pulse" />
                            <div className="h-48 rounded-lg bg-muted animate-pulse" />
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 space-y-4">
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

                    <div className="space-y-4">
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

export function MyBoardRouteSkeleton() {
    return (
        <div className="h-full flex flex-col">
            <div className="p-3 md:p-4 flex items-center justify-between shrink-0">
                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            </div>

            <div className="flex-1 overflow-x-auto p-3 md:p-4">
                <div className="flex gap-3 h-full">
                    {[0, 1, 2, 3].map((colIndex) => (
                        <div
                            key={colIndex}
                            className="w-72 flex flex-col bg-muted/30 rounded-lg shrink-0"
                        >
                            <div className="p-3 flex items-center justify-between">
                                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                <div className="h-5 w-5 bg-muted rounded-full animate-pulse" />
                            </div>

                            <div className="flex-1 p-2 space-y-2">
                                {Array.from({ length: Math.max(1, 3 - colIndex % 2) }).map((_, cardIndex) => (
                                    <div
                                        key={cardIndex}
                                        className="h-16 bg-muted rounded-lg animate-pulse"
                                        style={{ animationDelay: `${(colIndex * 3 + cardIndex) * 40}ms` }}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export function ProjectRouteSkeleton() {
    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 bg-background">
                <div className="flex items-center justify-between gap-2 p-3">
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-32 bg-muted rounded animate-pulse" />
                        <div className="h-7 w-20 bg-muted/50 rounded animate-pulse delay-75" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-20 bg-muted rounded-lg animate-pulse" />
                    </div>
                </div>
            </div>

            <div className="flex-1 p-3 space-y-2 overflow-auto">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-lg overflow-hidden bg-muted/30 animate-pulse"
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-muted rounded" />
                                <div className="h-4 w-24 bg-muted rounded" />
                                <div className="h-3 w-16 bg-muted rounded" />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-12 bg-muted rounded" />
                                <div className="h-5 w-5 bg-muted rounded" />
                            </div>
                        </div>
                    </div>
                ))}

                <div className="rounded-lg overflow-hidden bg-muted/20 animate-pulse delay-300">
                    <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 bg-muted rounded" />
                            <div className="h-4 w-28 bg-muted rounded" />
                        </div>
                        <div className="h-5 w-5 bg-muted rounded" />
                    </div>
                </div>
            </div>
        </div>
    )
}

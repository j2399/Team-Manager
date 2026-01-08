"use client"

export default function ProjectLoading() {
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
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

            {/* Collapsed Push Bars */}
            <div className="flex-1 p-3 space-y-2 overflow-auto">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-lg overflow-hidden animate-pulse"
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        <div className="flex items-center justify-between p-3 bg-muted/20">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-muted rounded" />
                                <div className="h-4 w-24 bg-muted rounded" />
                                <div className="h-3 w-16 bg-muted/60 rounded" />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-12 bg-muted rounded" />
                                <div className="h-5 w-5 bg-muted rounded" />
                            </div>
                        </div>
                    </div>
                ))}

                {/* Unassigned section */}
                <div className="rounded-lg overflow-hidden animate-pulse delay-300">
                    <div className="flex items-center justify-between p-3 bg-muted/10">
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

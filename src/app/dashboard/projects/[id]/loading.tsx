"use client"

export default function ProjectLoading() {
    return (
        <div className="h-full flex flex-col">
            {/* Project Header */}
            <div className="p-4 border-b shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="h-7 w-40 bg-muted rounded animate-pulse" />
                        <div className="h-5 w-5 bg-muted rounded animate-pulse delay-75" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-20 bg-muted rounded animate-pulse" />
                        <div className="h-8 w-8 bg-muted rounded animate-pulse delay-50" />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1">
                    {['Board', 'Timeline', 'Settings'].map((tab, i) => (
                        <div
                            key={tab}
                            className="h-8 w-20 bg-muted rounded animate-pulse"
                            style={{ animationDelay: `${i * 50}ms` }}
                        />
                    ))}
                </div>
            </div>

            {/* Push/Sprint Bar */}
            <div className="p-3 border-b shrink-0 flex items-center gap-2 overflow-x-auto">
                <div className="h-7 w-16 bg-muted rounded animate-pulse" />
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-7 w-24 bg-muted/50 rounded-full animate-pulse shrink-0"
                        style={{ animationDelay: `${i * 60}ms` }}
                    />
                ))}
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-4 h-full min-w-max">
                    {['To Do', 'In Progress', 'Review', 'Done'].map((colName, colIndex) => (
                        <div
                            key={colName}
                            className="w-72 flex flex-col bg-muted/20 rounded-lg border border-border"
                            style={{ animationDelay: `${colIndex * 80}ms` }}
                        >
                            {/* Column Header */}
                            <div className="p-3 border-b flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                    <div className="h-5 w-5 bg-muted rounded-full animate-pulse" />
                                </div>
                                <div className="h-6 w-6 bg-muted rounded animate-pulse" />
                            </div>

                            {/* Task Cards */}
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                                {Array.from({ length: Math.max(1, 4 - colIndex) }).map((_, cardIndex) => (
                                    <div
                                        key={cardIndex}
                                        className="bg-background border border-border rounded-lg p-3 space-y-2 animate-pulse"
                                        style={{ animationDelay: `${(colIndex * 4 + cardIndex) * 40}ms` }}
                                    >
                                        {/* Push tag */}
                                        {cardIndex < 2 && (
                                            <div className="h-4 w-16 bg-muted rounded-full" />
                                        )}
                                        {/* Title */}
                                        <div className="h-4 bg-muted rounded w-full" />
                                        {cardIndex === 0 && <div className="h-4 bg-muted rounded w-3/4" />}
                                        {/* Footer */}
                                        <div className="flex items-center justify-between pt-1">
                                            <div className="flex items-center gap-1">
                                                <div className="w-4 h-4 bg-muted rounded" />
                                                <div className="w-4 h-4 bg-muted rounded" />
                                            </div>
                                            <div className="flex -space-x-1">
                                                <div className="w-5 h-5 rounded-full bg-muted border-2 border-background" />
                                                {cardIndex === 0 && <div className="w-5 h-5 rounded-full bg-muted border-2 border-background" />}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

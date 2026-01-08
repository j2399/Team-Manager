"use client"

export default function MyBoardLoading() {
    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-6 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-5 w-20 bg-muted rounded animate-pulse delay-75" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-8 w-24 bg-muted rounded animate-pulse" />
                </div>
            </div>

            {/* Kanban Columns */}
            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-4 h-full min-w-max">
                    {['To Do', 'In Progress', 'Review', 'Done'].map((colName, colIndex) => (
                        <div
                            key={colName}
                            className="w-72 flex flex-col bg-muted/20 rounded-lg border border-border"
                            style={{ animationDelay: `${colIndex * 100}ms` }}
                        >
                            {/* Column Header */}
                            <div className="p-3 border-b flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                    <div className="h-5 w-5 bg-muted rounded-full animate-pulse" />
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                                {[0, 1, 2].slice(0, colIndex === 3 ? 1 : 3 - colIndex % 2).map((cardIndex) => (
                                    <div
                                        key={cardIndex}
                                        className="bg-background border border-border rounded-lg p-3 space-y-2 animate-pulse"
                                        style={{ animationDelay: `${(colIndex * 3 + cardIndex) * 50}ms` }}
                                    >
                                        {/* Card color bar */}
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-muted" />
                                            <div className="h-3 flex-1 bg-muted rounded" style={{ width: `${80 - cardIndex * 15}%` }} />
                                        </div>
                                        {/* Card title */}
                                        <div className="h-4 bg-muted rounded w-full" />
                                        {cardIndex === 0 && <div className="h-4 bg-muted rounded w-2/3" />}
                                        {/* Card footer */}
                                        <div className="flex items-center justify-between pt-1">
                                            <div className="flex items-center gap-1">
                                                <div className="w-4 h-4 bg-muted rounded" />
                                                <div className="w-3 h-3 bg-muted rounded" />
                                            </div>
                                            <div className="w-5 h-5 rounded-full bg-muted" />
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

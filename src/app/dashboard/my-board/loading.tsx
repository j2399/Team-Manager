"use client"

export default function MyBoardLoading() {
    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 flex items-center justify-between shrink-0">
                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            </div>

            {/* Kanban Columns */}
            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-3 h-full">
                    {[0, 1, 2, 3].map((colIndex) => (
                        <div
                            key={colIndex}
                            className="w-72 flex flex-col bg-muted/10 rounded-lg shrink-0"
                        >
                            {/* Column Header */}
                            <div className="p-3 flex items-center justify-between">
                                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                <div className="h-5 w-5 bg-muted rounded-full animate-pulse" />
                            </div>

                            {/* Cards */}
                            <div className="flex-1 p-2 space-y-2">
                                {Array.from({ length: Math.max(1, 3 - colIndex % 2) }).map((_, cardIndex) => (
                                    <div
                                        key={cardIndex}
                                        className="h-16 bg-muted/30 rounded-lg animate-pulse"
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

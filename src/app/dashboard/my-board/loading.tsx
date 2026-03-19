"use client"

export default function MyBoardLoading() {
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-4">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-8 w-24 rounded bg-muted" />
            </div>

            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex h-full gap-3">
                    {[0, 1, 2, 3].map((column) => (
                        <div
                            key={column}
                            className="flex w-72 shrink-0 flex-col rounded-lg border border-border/60 bg-card"
                        >
                            <div className="flex items-center justify-between p-3">
                                <div className="h-4 w-20 rounded bg-muted" />
                                <div className="h-5 w-5 rounded-full bg-muted" />
                            </div>
                            <div className="flex-1 space-y-2 p-2">
                                {Array.from({ length: Math.max(1, 3 - column % 2) }).map((_, card) => (
                                    <div key={card} className="h-16 rounded-lg bg-muted/80" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

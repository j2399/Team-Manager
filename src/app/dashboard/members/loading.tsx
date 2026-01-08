"use client"

export default function MembersLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="h-6 w-28 bg-muted rounded animate-pulse" />
                    <div className="h-9 w-24 bg-muted rounded animate-pulse" />
                </div>

                <div className="rounded-lg overflow-hidden bg-muted/10">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 p-3"
                        >
                            <div
                                className="w-8 h-8 rounded-full bg-muted animate-pulse"
                                style={{ animationDelay: `${i * 40}ms` }}
                            />
                            <div
                                className="h-4 flex-1 bg-muted/50 rounded animate-pulse"
                                style={{ animationDelay: `${i * 40 + 20}ms` }}
                            />
                            <div
                                className="h-5 w-16 bg-muted/40 rounded-full animate-pulse"
                                style={{ animationDelay: `${i * 40 + 40}ms` }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

"use client"

export default function MembersLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="h-7 w-36 bg-muted rounded animate-pulse" />
                    <div className="h-9 w-28 bg-muted rounded animate-pulse" />
                </div>

                {/* Member Stats */}
                <div className="flex items-center gap-4">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 rounded-lg animate-pulse"
                            style={{ animationDelay: `${i * 50}ms` }}
                        >
                            <div className="h-4 w-4 bg-muted rounded" />
                            <div className="h-4 w-12 bg-muted rounded" />
                        </div>
                    ))}
                </div>

                {/* Member List */}
                <div className="border border-border rounded-lg overflow-hidden">
                    {/* Header Row */}
                    <div className="grid grid-cols-4 gap-4 p-3 bg-muted/30 border-b">
                        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                        <div className="h-4 w-12 bg-muted rounded animate-pulse delay-50" />
                        <div className="h-4 w-16 bg-muted rounded animate-pulse delay-100" />
                        <div className="h-4 w-14 bg-muted rounded animate-pulse delay-150" />
                    </div>

                    {/* Member Rows */}
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div
                            key={i}
                            className="grid grid-cols-4 gap-4 p-3 border-b last:border-b-0 items-center"
                            style={{ animationDelay: `${i * 40}ms` }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                                <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${70 - (i % 3) * 15}%` }} />
                            </div>
                            <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
                            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                            <div className="h-7 w-7 bg-muted rounded animate-pulse ml-auto" />
                        </div>
                    ))}
                </div>

                {/* Invite Section */}
                <section className="border border-border rounded-lg p-4 space-y-3">
                    <div className="h-5 w-32 bg-muted rounded animate-pulse" />
                    <div className="flex items-center gap-2">
                        <div className="h-10 flex-1 bg-muted rounded animate-pulse" />
                        <div className="h-10 w-20 bg-muted rounded animate-pulse delay-50" />
                    </div>
                </section>
            </div>
        </div>
    )
}

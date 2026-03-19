"use client"

export default function ProjectLoading() {
    return (
        <div className="flex h-full flex-col">
            <div className="shrink-0 bg-background">
                <div className="flex items-center justify-between gap-2 p-3">
                    <div className="flex items-center gap-3">
                        <div className="h-6 w-32 rounded bg-muted" />
                        <div className="h-7 w-20 rounded bg-muted/80" />
                    </div>
                    <div className="h-8 w-20 rounded-lg bg-muted" />
                </div>
            </div>

            <div className="flex-1 space-y-2 overflow-auto p-3">
                {[0, 1, 2].map((item) => (
                    <div key={item} className="rounded-lg border border-border/60 bg-card">
                        <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3">
                                <div className="h-3 w-3 rounded bg-muted" />
                                <div className="h-4 w-24 rounded bg-muted" />
                                <div className="h-3 w-16 rounded bg-muted/80" />
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-12 rounded bg-muted/80" />
                                <div className="h-5 w-5 rounded bg-muted" />
                            </div>
                        </div>
                    </div>
                ))}

                <div className="rounded-lg border border-border/60 bg-card">
                    <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded bg-muted" />
                            <div className="h-4 w-28 rounded bg-muted" />
                        </div>
                        <div className="h-5 w-5 rounded bg-muted" />
                    </div>
                </div>
            </div>
        </div>
    )
}

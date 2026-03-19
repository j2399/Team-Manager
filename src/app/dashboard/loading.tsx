"use client"

export default function DashboardLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="space-y-5 p-4 md:p-6">
                <div className="flex items-center gap-3">
                    <div className="h-6 w-44 rounded bg-muted" />
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <div className="space-y-5 lg:col-span-2">
                        <section className="rounded-lg border border-border/60 bg-card p-4">
                            <div className="mb-3 h-4 w-20 rounded bg-muted" />
                            <div className="space-y-2">
                                {[0, 1, 2, 3].map((item) => (
                                    <div key={item} className="h-10 rounded bg-muted/80" />
                                ))}
                            </div>
                        </section>

                        <section className="rounded-lg border border-border/60 bg-card p-4">
                            <div className="mb-3 h-4 w-32 rounded bg-muted" />
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
                                    <div key={item} className="h-20 rounded-md bg-muted/80" />
                                ))}
                            </div>
                        </section>
                    </div>

                    <div>
                        <section className="rounded-lg border border-border/60 bg-card p-4">
                            <div className="mb-3 h-4 w-16 rounded bg-muted" />
                            <div className="space-y-2">
                                {[0, 1, 2, 3].map((item) => (
                                    <div key={item} className="h-8 rounded bg-muted/80" />
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

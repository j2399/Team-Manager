"use client"

export default function SettingsLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 max-w-4xl space-y-6">
                {/* Header */}
                <div className="h-7 w-32 bg-muted rounded animate-pulse" />

                {/* Workspace Settings Section */}
                <section className="border border-border rounded-lg p-4 space-y-4">
                    <div className="h-5 w-40 bg-muted rounded animate-pulse" />
                    <div className="space-y-3">
                        <div>
                            <div className="h-3 w-24 bg-muted rounded animate-pulse mb-2" />
                            <div className="h-10 w-full bg-muted rounded animate-pulse" />
                        </div>
                        <div>
                            <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2 delay-50" />
                            <div className="h-10 w-full bg-muted rounded animate-pulse delay-50" />
                        </div>
                    </div>
                    <div className="h-9 w-24 bg-muted rounded animate-pulse" />
                </section>

                {/* Appearance Section */}
                <section className="border border-border rounded-lg p-4 space-y-4">
                    <div className="h-5 w-28 bg-muted rounded animate-pulse delay-100" />
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-muted rounded-lg animate-pulse delay-100" />
                        <div className="h-10 w-10 bg-muted rounded-lg animate-pulse delay-150" />
                        <div className="h-10 w-10 bg-muted rounded-lg animate-pulse delay-200" />
                    </div>
                </section>

                {/* Discord Section */}
                <section className="border border-border rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="h-5 w-5 bg-muted rounded animate-pulse delay-150" />
                        <div className="h-5 w-36 bg-muted rounded animate-pulse delay-150" />
                    </div>
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between p-2 border rounded-md"
                                style={{ animationDelay: `${(i + 4) * 50}ms` }}
                            >
                                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                                <div className="h-5 w-10 bg-muted rounded-full animate-pulse" />
                            </div>
                        ))}
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 bg-destructive/30 rounded animate-pulse delay-200" />
                        <div className="h-5 w-32 bg-destructive/30 rounded animate-pulse delay-200" />
                    </div>
                    <div className="h-9 w-36 bg-destructive/20 rounded animate-pulse delay-250" />
                </section>
            </div>
        </div>
    )
}

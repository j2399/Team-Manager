"use client"

export default function SettingsLoading() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 md:p-6 max-w-4xl space-y-5">
                <div className="h-6 w-24 bg-muted rounded animate-pulse" />

                {[0, 1, 2].map((i) => (
                    <section
                        key={i}
                        className="rounded-lg p-4 space-y-3 bg-muted/10"
                    >
                        <div
                            className="h-4 w-32 bg-muted rounded animate-pulse"
                            style={{ animationDelay: `${i * 80}ms` }}
                        />
                        <div
                            className="h-10 w-full bg-muted/40 rounded animate-pulse"
                            style={{ animationDelay: `${i * 80 + 40}ms` }}
                        />
                    </section>
                ))}
            </div>
        </div>
    )
}

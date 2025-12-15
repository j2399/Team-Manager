import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { Sidebar } from "@/components/layout/Sidebar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import { NotificationBell } from "@/components/NotificationBell"
import { ThemeClient } from "@/components/ThemeClient"

import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
    const user = await getCurrentUser()
    return {
        title: user?.workspaceName ? `${user.workspaceName} | CuPI` : 'CuPI Platform',
    }
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getCurrentUser()
    if (!user) redirect('/')
    if (!user.workspaceId) redirect('/workspaces')

    return (
        <div className="flex min-h-screen w-full bg-background">
            <div className="hidden md:block fixed inset-y-0 left-0 z-10 w-64 bg-background">
                <Sidebar initialUserData={{ id: user.id, name: user.name, role: user.role, workspaceName: user.workspaceName, avatar: user.avatar }} />
            </div>

            <div className="flex flex-col flex-1 md:ml-64">
                {/* Mobile header */}
                <header className="flex h-12 items-center justify-between gap-4 border-b bg-background px-4 md:hidden">
                    <div className="flex items-center gap-4">
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8">
                                    <Menu className="h-4 w-4" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 w-64">
                                <Sidebar initialUserData={{ id: user.id, name: user.name, role: user.role, workspaceName: user.workspaceName, avatar: user.avatar }} />
                            </SheetContent>
                        </Sheet>
                        <span className="text-sm font-semibold">{user.workspaceName}</span>
                    </div>
                    <NotificationBell />
                </header>

                {/* Desktop notification bar */}
                <header className="hidden md:flex h-10 items-center justify-end gap-4 border-b bg-background px-4">
                    <NotificationBell />
                </header>

                <main className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/30" style={{ scrollbarGutter: "stable" }}>
                    <ThemeClient userId={user.id} />
                    {children}
                </main>
            </div>
        </div>
    )
}

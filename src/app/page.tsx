import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function LandingPage() {
    const user = await getCurrentUser()

    // If user is logged in, send them to workspace hub
    if (user && user.id && user.id !== 'pending') {
        redirect('/workspaces')
    }

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center bg-zinc-50 overflow-hidden font-sans text-center text-zinc-900 selection:bg-zinc-200">

            {/* Dither/Noise Overlay */}
            <div
                className="fixed inset-0 z-10 pointer-events-none opacity-[0.12] mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />

            <div className="relative z-30 w-full max-w-lg flex flex-col items-center justify-center gap-10 px-4 animate-in fade-in zoom-in-95 duration-700 slide-in-from-bottom-8">

                {/* Hero Section */}
                <div className="space-y-4">
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-zinc-900 pb-2">
                        CuPI
                    </h1>
                    <p className="text-lg md:text-xl text-zinc-500 font-medium max-w-lg mx-auto leading-relaxed">
                        Team management solution developed by <br /> <span className="text-zinc-900 font-semibold">Cornell Physical Intelligence</span>
                    </p>
                </div>

                <div className="w-full flex flex-col gap-4">
                    {/* Show "Continue as" if user has cached Discord info */}
                    {user && user.name && user.id === 'pending' ? (
                        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-zinc-200 shadow-xl ring-1 ring-zinc-900/5 space-y-6">
                            <div className="flex flex-col items-center gap-3">
                                {user.avatar ? (
                                    <img
                                        src={user.avatar} // Pending users have full URL
                                        alt={user.name}
                                        className="w-20 h-20 rounded-full border-4 border-white shadow-md grayscale"
                                    />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center border-4 border-white shadow-md text-zinc-400">
                                        <span className="text-3xl font-bold">
                                            {user.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="text-center">
                                    <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider text-[10px]">Welcome Back</p>
                                    <h3 className="text-lg font-semibold text-zinc-900">{user.name}</h3>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Link
                                    href="/api/discord/login"
                                    className="group relative w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-3.5 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <span>Continue to Workspace</span>
                                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </Link>
                                <form action="/api/discord/login" method="GET" className="w-full">
                                    <button
                                        type="submit"
                                        className="w-full text-xs font-medium text-zinc-400 hover:text-zinc-700 py-2 transition-colors"
                                    >
                                        Log in with a different account
                                    </button>
                                </form>
                            </div>
                        </div>
                    ) : (
                        <form action="/api/discord/login" method="GET" className="w-full">
                            <button
                                type="submit"
                                className="group w-full bg-white hover:bg-zinc-50 text-zinc-900 px-8 py-4 rounded-2xl font-medium transition-all border border-zinc-200 shadow-xl shadow-zinc-200/50 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                            >
                                <svg className="w-6 h-6 text-[#5865f2]" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.7748-.6091 1.1696-2.2408-.3345-4.4325-.3345-6.6262 0-.1715-.4076-.4129-.8071-.6317-1.1824a.077.077 0 00-.0796-.0366 19.7363 19.7363 0 00-4.8817 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.0991.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1568 2.419zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1568 2.419z" />
                                </svg>
                                Log in with Discord
                            </button>
                        </form>
                    )}
                </div>
            </div>

            <footer className="absolute bottom-6 z-40 text-center space-y-4 px-4 w-full">
                <p className="text-[10px] text-zinc-400 max-w-md mx-auto leading-relaxed opacity-60">
                    This organization is not yet a registered student organization of Cornell University.
                    <br />
                    <a href="https://hr.cornell.edu/about/workplace-rights/equal-education-and-employment" className="hover:text-zinc-600 transition-colors">Equal Education and Employment</a>
                </p>
            </footer>
        </div>
    )
}

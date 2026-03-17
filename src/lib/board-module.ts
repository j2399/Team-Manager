type BoardModule = typeof import("@/features/kanban/Board")

let boardModulePromise: Promise<{ default: BoardModule["Board"] }> | null = null

export function loadBoardModule() {
    if (!boardModulePromise) {
        boardModulePromise = import("@/features/kanban/Board").then((mod) => ({ default: mod.Board }))
    }

    return boardModulePromise
}

export function preloadBoardModule() {
    void loadBoardModule()
}

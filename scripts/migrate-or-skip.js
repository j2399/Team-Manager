#!/usr/bin/env node

const { spawnSync } = require("child_process")

function run() {
  if (process.env.SKIP_MIGRATIONS === "1") {
    console.log("[migrate] SKIP_MIGRATIONS=1, skipping prisma migrate deploy")
    return 0
  }

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    encoding: "utf8",
  })

  if (result.status === 0) {
    process.stdout.write(result.stdout || "")
    process.stderr.write(result.stderr || "")
    return 0
  }

  const output = `${result.stdout || ""}\n${result.stderr || ""}`
  const isLockTimeout = output.includes("P1002") || output.includes("advisory lock") || output.includes("timed out")

  if (isLockTimeout) {
    console.warn("[migrate] Migration skipped due to database lock timeout. Will proceed with build.")
    return 0
  }

  process.stdout.write(result.stdout || "")
  process.stderr.write(result.stderr || "")
  return result.status || 1
}

process.exit(run())

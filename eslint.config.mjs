import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".codex-run/**",
    "backup_db.js",
    "scripts/**/*.js",
    "lint_*.txt",
    // Convex backend functions (not Next.js code)
    "convex/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;

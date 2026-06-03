const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");

// Flat config (ESLint 9). The admin/ app has its own toolchain and is linted
// separately, so it's ignored here. Type-aware rules are intentionally not
// enabled (no parserOptions.project) to keep lint fast; tsc handles type
// correctness via `npm run check:types`.
module.exports = tseslint.config(
  {
    ignores: [
      "node_modules",
      "dist",
      "admin",
      "static-build",
      ".expo",
      "drizzle",
    ],
  },

  // TypeScript / TSX — server, shared, client.
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Allow ambient `declare global { namespace Express { ... } }` for the
      // Request type augmentation in server/auth.ts; still ban real namespaces.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // CommonJS config files (babel.config.js, this file).
  {
    files: ["**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
);

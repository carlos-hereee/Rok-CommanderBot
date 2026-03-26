// eslint.config.js
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  // ① base JS recommended rules
  js.configs.recommended,

  // ② TypeScript + your existing rules + new plugins
  {
    files: ["**/*.ts"],  // ← only lint TS files

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType:  "module",
        project:     "./tsconfig.json",   // ← gives ESLint access to your types
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      import:               importPlugin,
      prettier:             prettierPlugin,
    },

    rules: {
      // ── your existing rules (kept as-is) ──────────────────
      "arrow-spacing":           ["warn", { before: true, after: true }],
      "brace-style":             ["error", "stroustrup", { allowSingleLine: true }],
      "comma-dangle":            ["error", "always-multiline"],
      "comma-spacing":           "error",
      "comma-style":             "error",
      "curly":                   ["error", "multi-line", "consistent"],
      "dot-location":            ["error", "property"],
      "handle-callback-err":     "off",
      "indent":                  ["error", "tab"],
      "keyword-spacing":         "error",
      "max-nested-callbacks":    ["error", { max: 4 }],
      "max-statements-per-line": ["error", { max: 2 }],
      "no-console":              "off",
      "no-empty-function":       "error",
      "no-floating-decimal":     "error",
      "no-inline-comments":      "off",
      "no-lonely-if":            "error",
      "no-multi-spaces":         "error",
      "no-multiple-empty-lines": ["error", { max: 2, maxEOF: 1, maxBOF: 0 }],
      "no-shadow":               ["error", { allow: ["err", "resolve", "reject"] }],
      "no-trailing-spaces":      ["error"],
      "no-var":                  "error",
      "no-undef":                "off",      // ← off because TS handles this
      "object-curly-spacing":    ["error", "always"],
      "prefer-const":            "error",
      "semi":                    ["error", "always"],
      "space-before-blocks":     "error",
      "space-before-function-paren": ["error", {
        anonymous:  "never",
        named:      "never",
        asyncArrow: "always",
      }],
      "space-in-parens":  "error",
      "space-infix-ops":  "error",
      "space-unary-ops":  "error",
      "spaced-comment":   "error",
      "yoda":             "error",
 "no-unused-vars": ["error", {
            "vars": "all",
            "args": "after-used",
            "caughtErrors": "all",
            "ignoreRestSiblings": false,
            "ignoreUsingDeclarations": false,
            "reportUsedIgnorePattern": false
        }],
      // ── new TypeScript rules ───────────────────────────────
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",    // ← ignores _details, _emoji etc
        varsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "warn",

      // ── new import rules ───────────────────────────────────
      "import/extensions": ["error", "always", {
        js: "always",
        ts: "never",
      }],

      // ── prettier runs as a rule ────────────────────────────
      "prettier/prettier": "off",  // ← off because the prettier config at the end already disables conflicting rules
    },
  },

  // ③ prettier config MUST be last — disables conflicting rules
  prettierConfig,

  // ④ ignore compiled output
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
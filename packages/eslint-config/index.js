/** Shared flat ESLint baseline. Consumers install eslint separately. */
export default [
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
  { files: ["**/*.{js,mjs,cjs}"], rules: { "no-debugger": "error", "no-constant-condition": "error", "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] } }
];

// Temporary declaration to satisfy TypeScript when @types.eslint-plugin-promise is not available.
// Prefer installing `@types/eslint-plugin-promise` if it becomes available.
declare module 'eslint-plugin-promise' {
  // Export as unknown to avoid using `any` and satisfy lint rules.
  const eslintPluginPromise: unknown
  export = eslintPluginPromise
}

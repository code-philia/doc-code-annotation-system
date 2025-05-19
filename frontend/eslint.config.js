import tseslint from 'typescript-eslint';

export default tseslint.config(
  tseslint.configs.recommended,
  {
    rules: {
      'prefer-const': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
);

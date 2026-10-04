import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/backup-*/**', '.runtime/**', '.scratch/**'] },
  {
    files: ['plugins/agent-team/**/*.mjs', 'eslint.config.mjs'],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['plugins/agent-team/web/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='+'][left.type='Literal'][left.value=/^</]",
          message: 'HTML 使用多行模板和具名渲染函数，不使用字符串加号拼接。',
        },
      ],
    },
  },
];

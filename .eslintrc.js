module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  parser: '@typescript-eslint/parser',
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2018,
  },
  rules: {
    'prettier/prettier': 'error',
    'no-console': 'off',
    'class-methods-use-this': 'off',
    'max-len': ['error', { code: 120 }],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  ignorePatterns: ['node_modules/', 'mochawesome-report/'],
};

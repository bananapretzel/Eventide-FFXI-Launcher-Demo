module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'import/prefer-default-export': 'off',
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx}'],
      rules: {
        // TypeScript handles undeclared names/types; this rule often false-positives in TS.
        'no-undef': 'off',
      },
    },
    {
      files: ['src/{main,core,logic}/**/*.{ts,tsx}'],
      rules: {
        // Electron/Node code frequently needs loops + sequential awaits.
        'no-restricted-syntax': 'off',
        'no-await-in-loop': 'off',
        'no-continue': 'off',
        'no-plusplus': 'off',
        // Some modules intentionally use conditional requires.
        'global-require': 'off',
        // Large modules may declare helpers after usage; keep lint focused on real issues.
        'no-use-before-define': 'off',
        'no-loop-func': 'off',
      },
    },
    {
      files: [
        'src/**/__tests__/**/*.{ts,tsx,js,jsx}',
        'src/__tests__/**/*.{ts,tsx,js,jsx}',
      ],
      rules: {
        'no-restricted-syntax': 'off',
        'global-require': 'off',
        'jest/no-conditional-expect': 'off',
      },
    },
    {
      files: ['__mocks__/**/*.{js,ts}'],
      rules: {
        'no-underscore-dangle': 'off',
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};

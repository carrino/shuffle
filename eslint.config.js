import tseslint from 'typescript-eslint';

// The one rule that matters: Math.random is not seedable and must never be
// used in simulation code (or anywhere in src — the UI uses the seedable
// PRNG too, so results are reproducible end to end).
export default tseslint.config(
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random is not seedable. Use the PRNG from src/sim/prng.ts.',
        },
      ],
    },
  },
);

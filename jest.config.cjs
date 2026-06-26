// jest.config.cjs  — CommonJS format required because package.json has "type":"module"
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json', // CJS-mode tsconfig — avoids ESM/Jest friction
        diagnostics: true,
      },
    ],
  },
  // Map `.js` ESM-style import extensions → actual source files
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  // 60 s per test — real LLM API calls can take 5–15 s each
  testTimeout: 60000,
  // Sequential execution — respects OpenRouter rate limits
  maxWorkers: 1,
  // Inject environment before each test file
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};

// Integration tests run against a real local Supabase stack at
// http://localhost:54321. Kept separate from `npm test` so unit tests stay
// hermetic. Opt in via `npm run test:integration` (added by a later phase).
module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/integration/**/*.integration.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  testTimeout: 30000,
};

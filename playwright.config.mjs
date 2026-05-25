import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
  },
  webServer: {
    command: '.venv/bin/uvicorn app.main:app --port 8000',
    port: 8000,
    timeout: 30000,
    reuseExistingServer: true,
    env: {
      TESTING: '1',
      DATABASE_URL: 'sqlite+aiosqlite:///./test_e2e.db',
      SECRET_KEY: 'test-secret-key-for-playwright-tests-12345',
      JWT_SECRET: 'test-jwt-secret-for-playwright-tests-12345',
      FERNET_KEY: 'dGVzdC1mZXJuZXQta2V5LWZvci1wbGF5d3JpZ2h0LXRlc3RzLTEyMzQ1',
    },
  },
});

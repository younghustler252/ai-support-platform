process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://test:test@127.0.0.1:5432/test";
process.env.AUTH_JWT_SECRET ??= "test-secret-test-secret-test-secret-0123";
process.env.AUTH_JWT_PREVIOUS_SECRET ??= "previous-secret-previous-secret-0123456";
process.env.AUTH_REFRESH_GRACE_SECONDS ??= "10";

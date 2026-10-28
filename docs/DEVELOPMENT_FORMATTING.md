# Code formatting

Use tabs for indentation in TypeScript, TSX, and JavaScript. Use 2 spaces for JSON, YAML, and Prisma schema files. Prefer multi-line object literals, functions, classes and JSX to compressed one-line code.

The repository's `.editorconfig` defines editor defaults. Prisma schemas should be formatted using `npm exec --workspace=@platform/api -- prisma format` once `DATABASE_URL` is set in the root `.env`. Review schema changes before committing.

This is formatting only; no new modules are implemented by these rules.

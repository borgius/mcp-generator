# Template: Create your MCP-powered VS Code extension

This repository is designed as a template. Use **Use this template** on GitHub or fork the repo to create your own MCP-backed extension.

Quick checklist

1. Fork / Use this template
2. Update `package.json` metadata: `name`, `displayName`, `description`, `publisher`
3. Configure `resources/mcp.json` (copy `resources/mcp.example.json` as a starting point)
4. Run `npm install` and `npm run update-tools`
5. Build & test: `npm run compile`, `npm test`, press `F5` to run in dev
6. Update README with your project's prerequisites and publish notes

CI notes

- This template includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs `npm test` and checks `update-tools` in CI mode on PRs.
- In CI mode (`CI=true`) `update-tools` will not overwrite `package.json` if it cannot reach your servers — it will warn and exit successfully.
- If update-tools would modify `package.json` in CI (i.e., discovered tools changed), the action will exit non-zero so you can run it locally and commit the changes.

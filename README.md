# MCP Generator

VS Code extension that:

1) embeds an internal MCP config at `resources/mcp.json`
2) generates `contributes.languageModelTools` in `package.json` by querying all MCP servers
3) on activation, starts those servers and proxies each VS Code tool invocation to the right MCP server/tool.

## Configure servers

Edit `resources/mcp.json`:

```jsonc
{
	"servers": {
		"brop-mcp": {
			"command": "npx",
			"args": ["@borgius/brop-mcp@latest"],
			"transport": { "type": "stdio", "framing": "ndjson" }
		}
	}
}
```

Supported stdio framings:

- `content-length` (default)
- `ndjson`

## Generate tools

Run:

`npm run update-tools`

This starts all servers from `resources/mcp.json`, calls MCP `tools/list`, and rewrites `package.json.contributes.languageModelTools`.

Tool IDs follow:

`mcp__<server>__<tool>`

## Run/debug

- `npm run compile`
- Press `F5` to launch the extension host.

Note: some MCP servers (like browser automation servers) may require an external app/extension (e.g. Chrome extension) connected before tool calls succeed.

## Using this repository as a template ✅

You can use this project as a starting point when creating your own VS Code extension that exposes MCP-backed tools. Below are step-by-step instructions and examples to help you fork, customize, test, and publish your extension.

### Quick start (recommended)

1. Use GitHub's **Use this template** button or fork the repo to create your own copy.
2. Clone your fork locally and install dependencies:

	```bash
	git clone <your-repo-url>
	cd <your-repo-folder>
	npm install
	```

3. Update extension metadata in `package.json`: **change at minimum** the `name`, `displayName`, `description`, and `publisher` fields so your extension is uniquely identified.

	Example:

	```jsonc
	{
	  "name": "my-mcp-extension",
	  "displayName": "My MCP Extension",
	  "description": "My custom tools backed by MCP servers",
	  "publisher": "your-publisher-id"
	}
	```

4. Configure MCP servers in `resources/mcp.json`. Each server needs a `command` (or absolute path), optional `args`, and a `transport` definition.

	Example (using `npx`):

	```jsonc
	{
	  "servers": {
		 "my-server": {
			"command": "npx",
			"args": ["@example/my-mcp-server@latest"],
			"transport": { "type": "stdio", "framing": "ndjson" }
		 }
	  }
	}
	```

	Tip: If your command is not on the GUI PATH (common on macOS), either use the absolute command path (e.g. `/opt/homebrew/bin/npx`) or launch VS Code from a terminal so it inherits your shell PATH.

5. Generate tool contributions and write them into `package.json`:

	```bash
	npm run update-tools
	```

	This starts the servers, calls `tools/list` and rewrites `contributes.languageModelTools` with friendly tool IDs and routing metadata (`mcpServer` / `mcpTool`).

6. Build and test:

	- Build: `npm run compile`
	- Run in development: Press `F5` to start the extension host and exercise the tools.
	- Tests: `npm test`

7. Publish (optional):

	- Install `vsce` or use `@vscode/vsce` to package and publish the extension.
	- Typical steps:

	  ```bash
	  npm install -g vsce
	  vsce package
	  vsce publish
	  ```

	  Make sure your `publisher` is set and you have created a publisher on the VS Code Marketplace.

### Common customization & tips

- Tool ID naming: The generator uses `serverShort_toolName` (e.g., `brop_cdp_navigate`). You can rename later in `package.json`, but keep `mcpServer` and `mcpTool` metadata pointing to the original MCP tool.
- PATH issues: If servers fail to spawn with `ENOENT`, either launch VS Code from a terminal or set `command` to an absolute path, or add an `env` entry into `resources/mcp.json`.
- External dependencies: Some MCP servers require external components (e.g., browser extensions, running browsers). Document prerequisites in your README.
- Security: Never commit secrets or private keys into `resources/mcp.json`. Use environment variables instead and document how to supply them locally or via CI.

### Template checklist

1. Fork or use this template
2. Update `package.json` metadata (`name`, `displayName`, `publisher`, `description`)
3. Edit `resources/mcp.json` to include your servers
4. Run `npm install` then `npm run update-tools`
5. Build & test: `npm run compile` + `F5`, `npm test`
6. Update README with project-specific instructions and prerequisites
7. Package & publish when ready

If you'd like, I can also add a GitHub Actions workflow to run `npm test` and `npm run update-tools` on each PR—done. See `.github/workflows/ci.yml`.

This repository also includes an optional auto-commit step (runs on pushes to the default branch) that will run `update-tools` and commit changes to `package.json` automatically. The action uses `GITHUB_TOKEN` and runs only on `push` events to avoid committing from forks via PRs. If you prefer not to auto-commit, remove or disable the corresponding step in `.github/workflows/ci.yml`.

Prefer editing `resources/mcp.example.json` when getting started and then copy it to `resources/mcp.json` in your fork when you're ready.

See `TEMPLATE.md` for a concise onboarding checklist.

Note: Update `.github/CODEOWNERS` with your GitHub handle so the correct people are requested for review automatically.

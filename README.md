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

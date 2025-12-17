import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { readMcpJsonFile } from './mcp/config';
import { McpManager } from './mcp/mcpManager';
import type { McpTool } from './mcp/types';

type LanguageModelToolContribution = {
	name: string;
	toolReferenceName?: string;
	displayName?: string;
	modelDescription?: string;
	userDescription?: string;
	canBeReferencedInPrompt?: boolean;
	tags?: string[];
	icon?: string;
	inputSchema?: object;
};

function sanitizeToolSegment(value: string): string {
	// Keep names stable and compatible for references.
	return value.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function toolReferenceName(server: string, toolName: string): string {
	// Tool IDs must match /^[\w-]+$/; dots aren't allowed.
	return `mcp__${sanitizeToolSegment(server)}__${sanitizeToolSegment(toolName)}`;
}

function coerceInputSchema(tool: McpTool): object {
	if (tool.inputSchema && typeof tool.inputSchema === 'object') {
		return tool.inputSchema;
	}
	return { type: 'object', properties: {} };
}

async function main(): Promise<void> {
	const projectRoot = process.cwd();
	const packageJsonPath = path.join(projectRoot, 'package.json');
	const internalMcpJsonPath = path.join(projectRoot, 'resources', 'mcp.json');

	const config = await readMcpJsonFile(internalMcpJsonPath);
	const manager = new McpManager(config, {
		rootDir: projectRoot,
		logger: (m) => process.stderr.write(m + '\n'),
		clientInfo: { name: 'mcp-generator', version: '0.0.1' },
	});

	try {
		const toolsByServer: Record<string, McpTool[]> = {};
		const failures: Array<{ server: string; error: unknown }> = [];

		for (const serverName of manager.getServerNames()) {
			try {
				toolsByServer[serverName] = await manager.listTools(serverName);
			} catch (error) {
				failures.push({ server: serverName, error });
			}
		}

		if (failures.length > 0) {
			const lines = failures.map((f) => `- ${f.server}: ${String((f.error as any)?.message ?? f.error)}`);
			throw new Error(`Failed to query tools from one or more MCP servers:\n${lines.join('\n')}`);
		}

		const contributions: LanguageModelToolContribution[] = [];

		const serverNames = Object.keys(toolsByServer).sort();
		for (const serverName of serverNames) {
			const tools = toolsByServer[serverName] ?? [];
			for (const tool of tools) {
				const ref = toolReferenceName(serverName, tool.name);
				const description = tool.description ?? '';
				contributions.push({
					name: ref,
					toolReferenceName: ref,
					displayName: `${tool.name} (${serverName})`,
					modelDescription: description,
					userDescription: description,
					canBeReferencedInPrompt: true,
					tags: ['mcp', sanitizeToolSegment(serverName)],
					icon: '$(tools)',
					inputSchema: coerceInputSchema(tool),
				});
			}
		}

		const rawPkg = await fs.readFile(packageJsonPath, 'utf8');
		const pkg = JSON.parse(rawPkg) as any;
		pkg.contributes ??= {};
		pkg.contributes.languageModelTools = contributions;

		await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
		process.stdout.write(`Updated contributes.languageModelTools (${contributions.length} tools)\n`);
	} finally {
		await manager.stopAll();
	}
}

main().catch((err) => {
	process.stderr.write(String(err?.stack ?? err) + '\n');
	process.exit(1);
});

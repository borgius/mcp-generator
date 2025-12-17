import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { readMcpJsonFile } from './mcp/config';
import { McpManager } from './mcp/mcpManager';
import type { McpTool } from './mcp/types';

type LanguageModelToolContribution = {
	name: string;
	toolReferenceName?: string;
	mcpServer?: string;
	mcpTool?: string;
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

function serverShortName(server: string): string {
	const trimmed = server.replace(/[-_]?mcp$/i, '');
	const base = trimmed.length > 0 ? trimmed : server;
	return sanitizeToolSegment(base);
}

function toolIdFor(server: string, toolName: string): string {
	const short = serverShortName(server);
	const tool = sanitizeToolSegment(toolName);
	if (!short) {
		return tool;
	}
	if (tool.startsWith(`${short}_`)) {
		return tool;
	}
	return `${short}_${tool}`;
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

		const isCi = String(process.env.CI ?? '').toLowerCase() === 'true';
		if (failures.length > 0) {
			const lines = failures.map((f) => `- ${f.server}: ${String((f.error as any)?.message ?? f.error)}`);
			const errMsg = `Failed to query tools from one or more MCP servers:\n${lines.join('\n')}`;
			if (isCi) {
				// In CI we don't want to fail because external servers may not be reachable.
				process.stderr.write('[warn] update-tools: some servers could not be queried; skipping update in CI\n');
				await manager.stopAll();
				process.exit(0);
			}
			throw new Error(errMsg);
		}

		const contributions: LanguageModelToolContribution[] = [];
		const usedIds = new Set<string>();

		const serverNames = Object.keys(toolsByServer).sort();
		for (const serverName of serverNames) {
			const tools = toolsByServer[serverName] ?? [];
			for (const tool of tools) {
				let id = toolIdFor(serverName, tool.name);
				if (usedIds.has(id)) {
					id = `${id}__${sanitizeToolSegment(serverName)}`;
				}
				usedIds.add(id);

				const description = tool.description ?? '';
				contributions.push({
					name: id,
					toolReferenceName: id,
					mcpServer: serverName,
					mcpTool: tool.name,
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

		if (contributions.length === 0) {
			process.stdout.write('No tools discovered; package.json not modified.\n');
			await manager.stopAll();
			return;
		}

		const rawPkg = await fs.readFile(packageJsonPath, 'utf8');
		const pkg = JSON.parse(rawPkg) as any;
		pkg.contributes ??= {};
		pkg.contributes.languageModelTools = contributions;

		const newPkgRaw = JSON.stringify(pkg, null, 2) + '\n';
		if (newPkgRaw === rawPkg) {
			process.stdout.write('No changes to package.json.\n');
			await manager.stopAll();
			return;
		}

		if (isCi) {
			// In CI, if update-tools would change package.json, fail to prompt author to run update-tools locally and commit.
			process.stderr.write('update-tools would modify package.json — please run `npm run update-tools` locally and commit the changes.\n');
			process.exit(2);
		}

		await fs.writeFile(packageJsonPath, newPkgRaw, 'utf8');
		process.stdout.write(`Updated contributes.languageModelTools (${contributions.length} tools)\n`);
	} finally {
		await manager.stopAll();
	}
}

main().catch((err) => {
	process.stderr.write(String(err?.stack ?? err) + '\n');
	process.exit(1);
});

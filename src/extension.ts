import * as vscode from 'vscode';

import * as path from 'node:path';

import { readMcpJsonFile } from './mcp/config';
import { McpManager } from './mcp/mcpManager';

type LanguageModelToolContribution = {
	name: string;
	toolReferenceName?: string;
};

function parseToolReferenceName(entry: LanguageModelToolContribution): string {
	// We generate contributions with name === toolReferenceName, but accept either.
	return entry.toolReferenceName ?? entry.name;
}

function parseMcpRef(refName: string): { server: string; tool: string } | undefined {
	// Expected: mcp__<server>__<tool>
	const prefix = 'mcp__';
	if (!refName.startsWith(prefix)) {
		return undefined;
	}
	const rest = refName.slice(prefix.length);
	const sep = '__';
	const firstSep = rest.indexOf(sep);
	if (firstSep === -1) {
		return undefined;
	}
	const server = rest.slice(0, firstSep);
	const tool = rest.slice(firstSep + sep.length);
	if (!server || !tool) {
		return undefined;
	}
	return { server, tool };
}

function mcpResultToText(result: unknown): string {
	if (!result || typeof result !== 'object') {
		return String(result);
	}

	const anyResult = result as any;
	const content = anyResult.content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const item of content) {
			if (item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
				parts.push(item.text);
			} else {
				parts.push(JSON.stringify(item));
			}
		}
		return parts.join('\n');
	}

	return JSON.stringify(result);
}


export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('MCP Generator');
	context.subscriptions.push(output);

	const internalMcpJsonPath = context.asAbsolutePath(path.join('resources', 'mcp.json'));
	const config = await readMcpJsonFile(internalMcpJsonPath);
	const manager = new McpManager(config, {
		rootDir: context.extensionPath,
		logger: (m) => output.appendLine(m),
		clientInfo: { name: 'mcp-generator', version: context.extension.packageJSON.version ?? '0.0.0' },
	});

	context.subscriptions.push(
		new vscode.Disposable(() => {
			void manager.stopAll();
		})
	);

	const failures = await manager.startAll({ continueOnError: true });
	for (const f of failures) {
		output.appendLine(`[warn] Failed to start '${f.server}': ${String((f.error as any)?.message ?? f.error)}`);
	}

	const contributed: LanguageModelToolContribution[] =
		(context.extension.packageJSON?.contributes?.languageModelTools as LanguageModelToolContribution[] | undefined) ?? [];

	for (const entry of contributed) {
		const refName = parseToolReferenceName(entry);
		const parsed = parseMcpRef(refName);
		if (!parsed) {
			output.appendLine(`[skip] Not an mcp.* tool: ${refName}`);
			continue;
		}

		context.subscriptions.push(
			vscode.lm.registerTool(refName, {
				async invoke(invocation, token) {
					const res = await manager.call(parsed.server, parsed.tool, invocation.input);
					const text = mcpResultToText(res);
					return { content: [new vscode.LanguageModelTextPart(text)] };
				},
			})
		);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}

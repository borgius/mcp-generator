import type { McpJson, McpServerConfig, McpTool } from './types';
import { McpServerClient, type McpServerClientOptions } from './mcpServer';

export class McpManager {
	private readonly servers = new Map<string, McpServerClient>();

	constructor(config: McpJson, opts?: McpServerClientOptions) {
		for (const [name, serverConfig] of Object.entries(config.servers ?? {})) {
			this.servers.set(name, new McpServerClient(name, serverConfig as McpServerConfig, opts));
		}
	}

	public async startAll(options?: { continueOnError?: boolean }): Promise<Array<{ server: string; error: unknown }>> {
		const failures: Array<{ server: string; error: unknown }> = [];
		const continueOnError = options?.continueOnError ?? false;
		for (const name of this.getServerNames()) {
			try {
				await this.mustGet(name).start();
			} catch (error) {
				failures.push({ server: name, error });
				if (!continueOnError) {
					throw error;
				}
			}
		}
		return failures;
	}

	public async stopAll(): Promise<void> {
		await Promise.all([...this.servers.values()].map((s) => s.stop()));
	}

	public getServerNames(): string[] {
		return [...this.servers.keys()].sort();
	}

	public async listAllTools(): Promise<Record<string, McpTool[]>> {
		const out: Record<string, McpTool[]> = {};
		for (const name of this.getServerNames()) {
			out[name] = await this.listTools(name);
		}
		return out;
	}

	public async listTools(serverName: string): Promise<McpTool[]> {
		const server = this.mustGet(serverName);
		return await server.listTools();
	}

	public async call(serverName: string, toolName: string, args: unknown): Promise<unknown> {
		const server = this.mustGet(serverName);
		return await server.callTool(toolName, args);
	}

	private mustGet(name: string): McpServerClient {
		const s = this.servers.get(name);
		if (!s) {
			throw new Error(`Unknown MCP server '${name}'`);
		}
		return s;
	}
}

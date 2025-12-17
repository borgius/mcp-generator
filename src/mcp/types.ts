export type McpJson = {
	servers: Record<string, McpServerConfig>;
};

export type McpServerConfig = {
	command: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	transport?: {
		type?: 'stdio';
		framing?: 'content-length' | 'ndjson';
	};
};

export type JsonRpcRequest = {
	jsonrpc: '2.0';
	id: number | string;
	method: string;
	params?: unknown;
};

export type JsonRpcNotification = {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
};

export type JsonRpcResponse = {
	jsonrpc: '2.0';
	id: number | string;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
};

export type McpTool = {
	name: string;
	description?: string;
	inputSchema?: object;
};

export type McpToolsListResponse = {
	tools: McpTool[];
	nextCursor?: string;
};

export type McpCallToolResponse = {
	content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
	isError?: boolean;
	[key: string]: unknown;
};

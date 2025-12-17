import * as fs from 'node:fs/promises';

import type { McpJson } from './types';

export async function readMcpJsonFile(filePath: string): Promise<McpJson> {
	const raw = await fs.readFile(filePath, 'utf8');
	const parsed = JSON.parse(raw) as Partial<McpJson>;
	return {
		servers: parsed.servers ?? {},
	};
}

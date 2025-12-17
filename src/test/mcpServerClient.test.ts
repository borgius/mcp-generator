import * as assert from 'assert';

import { McpServerClient } from '../mcp/mcpServer';

suite('McpServerClient', () => {
	test('start surfaces ENOENT when command missing', async () => {
		const logs: string[] = [];
		const client = new McpServerClient(
			'missing-cmd',
			{ command: 'definitely-not-a-real-command-12345' },
			{
				logger: (m) => logs.push(m),
				rootDir: process.cwd(),
				clientInfo: { name: 'test', version: '0.0.0' },
			}
		);

		let err: unknown;
		try {
			await client.start();
			assert.fail('Expected start() to throw');
		} catch (e) {
			err = e;
		} finally {
			await client.stop();
		}

		assert.ok(String((err as any)?.message ?? err).includes('ENOENT'));
		assert.ok(logs.some((l) => l.includes('spawn error')));
	});
});

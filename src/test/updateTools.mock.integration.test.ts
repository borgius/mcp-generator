import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as cp from 'child_process';
import * as path from 'path';

suite('update-tools with mock MCP', () => {
  test('CI run against mock MCP returns success and no package.json diff', async () => {
    const root = process.cwd();
    const pkgPath = path.join(root, 'package.json');
    const before = await fs.readFile(pkgPath, 'utf8');

    // write resources/mcp.json pointing to mock-mcp
    await fs.writeFile(path.join(root, 'resources', 'mcp.json'), JSON.stringify({
      servers: {
        'mock-mcp': {
          command: 'node',
          args: ['scripts/mock-mcp.js'],
          transport: { type: 'stdio', framing: 'ndjson' }
        }
      }
    }, null, 2) + '\n', 'utf8');

    await new Promise<void>((resolve, reject) => {
      const child = cp.execFile('node', ['dist/update-tools.js'], { env: { ...process.env, CI: 'true' } }, (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
      setTimeout(() => child.kill(), 20000);
    });

    const after = await fs.readFile(pkgPath, 'utf8');
    assert.strictEqual(before, after, 'package.json should remain unchanged after CI update-tools run against mock MCP');
  });
});

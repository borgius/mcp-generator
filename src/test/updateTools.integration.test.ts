import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as cp from 'child_process';
import * as path from 'path';

suite('update-tools CI mode', () => {
    test('does not modify package.json when no servers are configured', async () => {
        const root = process.cwd();
        const pkgPath = path.join(root, 'package.json');
        const before = await fs.readFile(pkgPath, 'utf8');

        await new Promise<void>((resolve, reject) => {
            const child = cp.execFile('node', ['dist/update-tools.js'], { env: { ...process.env, CI: 'true' } }, (err, stdout, stderr) => {
                if (err) {
                    // In CI mode update-tools may exit 0 even on warnings; fail only on unexpected exit codes
                    // but allow exit code 0 or 2 as documented behavior. Treat other codes as failure.
                    const code = (err as any)?.code;
                    if (code === 2) {
                        // indicates update-tools would modify package.json — in our setup with empty servers we expect no change.
                        reject(new Error('update-tools indicated package.json would change in CI mode'));
                        return;
                    }
                    reject(err);
                    return;
                }
                resolve();
            });
            // safety: kill after 20s
            setTimeout(() => child.kill(), 20000);
        });

        const after = await fs.readFile(pkgPath, 'utf8');
        assert.strictEqual(before, after, 'package.json should be unchanged when no servers are configured');
    });
});

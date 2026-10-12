import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let checked = 0;
for (const directory of ['src', 'web', 'scripts', 'test']) {
  for (const entry of await readdir(join(root, directory))) {
    if (!/\.(mjs|js)$/.test(entry)) continue;
    const file = join(root, directory, entry);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
    checked++;
  }
}
for (const file of ['package.json', '.codex-plugin/plugin.json']) JSON.parse(await readFile(join(root, file), 'utf8'));
process.stdout.write(`Syntax and manifests passed: ${checked} JavaScript files.\n`);

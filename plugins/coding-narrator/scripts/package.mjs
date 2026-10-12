import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative } from 'node:path';
import { zipSync, unzipSync, strToU8 } from 'fflate';

const plugin = fileURLToPath(new URL('../', import.meta.url));
const workspace = resolve(plugin, '../..');
const mode = process.argv[2] ?? 'source';
const version = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8')).version;
const archive = {};
async function collect(root, directory, prefix = '') {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in the package.');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(root, path, prefix);
    else archive[(prefix + relative(root, join(root, path))).replaceAll('\\', '/')] = new Uint8Array(await readFile(join(root, path)));
  }
}
if (mode === 'source') {
  for (const directory of ['src', 'web', 'scripts', 'skills', 'test', '.codex-plugin']) await collect(plugin, directory, 'plugins/coding-narrator/');
  for (const file of ['package.json', 'package-lock.json', 'Dockerfile', '.dockerignore']) archive[`plugins/coding-narrator/${file}`] = new Uint8Array(await readFile(join(plugin, file)));
  for (const file of ['README.md', 'install.ps1', 'install-claude.ps1', 'install-local-voices.ps1', 'render.yaml', 'VALIDATION.md', '.gitignore']) archive[file] = new Uint8Array(await readFile(join(workspace, file)));
  for (const file of ['download-models.py', 'synthesize-samples.py']) archive[`voice-lab/${file}`] = new Uint8Array(await readFile(join(workspace, 'voice-lab', file)));
  await collect(workspace, 'docs');
  archive['.agents/plugins/marketplace.json'] = new Uint8Array(await readFile(join(workspace, '.agents/plugins/marketplace.json')));
} else if (mode === 'chatgpt') {
  const argument = process.argv[3];
  if (!argument) throw new Error('Provide the actual deployed HTTPS MCP URL. No placeholder package is generated.');
  const url = new URL(argument);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/mcp') throw new Error('Use a clean HTTPS /mcp URL without credentials.');
  const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'coding-narrator', version,
    description: 'Speak requested progress summaries with natural AI voices and personal speaking skills.',
    extensions: { 'com.openai': { interface: {
      displayName: 'Coding Narrator', shortDescription: 'Hear progress in your style',
      longDescription: 'Opt-in spoken progress summaries with natural voices, caveman and custom speaking styles. Audio is AI generated. Hosted speech requires owner-configured API access and browser playback.',
      developerName: 'Personal Development', category: 'Productivity',
      capabilities: ['Read', 'Write'], defaultPrompt: ['Narrate progress in the caveman style while you work.'],
    } } },
  };
  archive['plugin.json'] = strToU8(JSON.stringify(manifest, null, 2));
  archive['mcp.json'] = strToU8(JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { narrator: { type: 'streamable-http', url: url.href } } }, null, 2));
  await collect(plugin, 'skills');
} else throw new Error('Choose source or chatgpt mode.');

for (const path of Object.keys(archive)) {
  if (path.split('/').some(part => part === '..' || part === 'node_modules' || part.startsWith('.env')) || /\.(wav|log)$/i.test(path)) throw new Error('Unsafe archive entry rejected.');
}
const bytes = zipSync(archive, { level: 6 });
const verified = unzipSync(bytes);
if (Object.keys(verified).length !== Object.keys(archive).length) throw new Error('Archive verification failed.');
const dist = join(workspace, 'dist');
await mkdir(dist, { recursive: true });
const output = join(dist, `coding-narrator-${mode}-${version}.zip`);
await writeFile(output, bytes);
process.stdout.write(`Verified ${mode} archive: ${Object.keys(archive).length} files, ${bytes.length} bytes.\n${output}\n`);

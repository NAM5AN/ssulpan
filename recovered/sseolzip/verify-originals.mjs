import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, relative, isAbsolute} from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
let failed = false;
try {
  const manifest = await readFile(resolve(root, 'ORIGINALS.sha256'), 'utf8');
  const lines = manifest.trim().split(/\r?\n/);
  if (lines.length !== 22) throw new Error('Expected 22 original file entries.');
  const seen = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error('Invalid manifest entry.');
    const [, expected, name] = match;
    const target = resolve(root, name);
    const rel = relative(root, target);
    if (rel.startsWith('..') || isAbsolute(rel) || seen.has(name)) throw new Error('Unsafe or duplicate manifest path.');
    seen.add(name);
    try {
      const bytes = await readFile(target);
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== expected) throw new Error('SHA-256 mismatch');
      console.log('OK ' + name);
    } catch (error) {
      failed = true;
      console.error('FAIL ' + name + ': ' + error.message);
    }
  }
  if (!failed) console.log('Verified 22 unchanged original files. This does not verify a runnable site.');
} catch (error) {
  failed = true;
  console.error(error.message);
}
if (failed) process.exitCode = 1;

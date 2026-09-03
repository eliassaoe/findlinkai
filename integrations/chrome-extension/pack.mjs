/**
 * Builds the .zip the Chrome Web Store dashboard wants.
 *
 * Rebuilds the generated operation list first, so a stale operations.js can never
 * be what gets uploaded — that is the one file in here nobody would notice was
 * wrong until a user clicked a button that charged the wrong number of credits.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, 'src', 'manifest.json'), 'utf8'));
const out = join(HERE, `linkfinder-ai-extension-${manifest.version}.zip`);

execFileSync('node', [join(HERE, 'build.mjs')], { stdio: 'inherit' });
execFileSync('node', [join(HERE, 'make-icons.mjs')], { stdio: 'inherit' });

// Regenerating must not have CHANGED anything already committed: if it did, the
// zip would differ from the source a reviewer reads on GitHub.
//
// Only modified tracked files are fatal. Untracked ones ('??') mean the generated
// output has simply never been committed — true on a first pack — and the rebuild
// above already guarantees it is correct, so that is a warning, not a blocker.
const status = execFileSync('git', ['status', '--porcelain', '--', 'src/generated', 'src/icons'], {
    cwd: HERE,
    encoding: 'utf8',
});
const lines = status.split('\n').filter(Boolean);
const modified = lines.filter((l) => !l.startsWith('??'));
if (modified.length) {
    console.error('Generated files were stale — commit the rebuild before packing:\n' + modified.join('\n'));
    process.exit(1);
}
if (lines.length) {
    console.warn('note: generated output is not committed yet:\n' + lines.join('\n'));
}

if (existsSync(out)) rmSync(out);
// -r recursive, -q quiet, -X drops extra file attributes that make the zip
// non-reproducible across machines.
execFileSync('zip', ['-rqX', out, '.'], { cwd: join(HERE, 'src') });

const bytes = readFileSync(out).length;
console.log(`\n${out.split('/').pop()} — ${(bytes / 1024).toFixed(1)} kB`);
console.log(`version ${manifest.version} · permissions: ${manifest.permissions.join(', ')} · hosts: ${manifest.host_permissions.join(', ')}`);
console.log('Upload at https://chrome.google.com/webstore/devconsole');

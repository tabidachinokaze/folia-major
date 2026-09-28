import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// ci/desktop-release-core.mjs
// Only successful, same-repository main builds can become stable releases.
export function validateRun(run, repository) {
    if (run.head_repository?.full_name !== repository || run.head_branch !== 'main'
        || !['push', 'workflow_dispatch'].includes(run.event)
        || run.path !== '.github/workflows/desktop-build.yml'
        || run.status !== 'completed' || run.conclusion !== 'success'
        || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '') || !Number.isSafeInteger(run.id)) {
        throw new Error('Release source must be a successful Build Desktop run on this repository main branch');
    }
    return run;
}

export function validatePackage(pkg, repository) {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version ?? '')) {
        throw new Error('Only plain stable A.B.C versions can be promoted');
    }
    const github = pkg.build?.publish?.find(provider => provider.provider === 'github');
    if (`${github?.owner}/${github?.repo}` !== repository) throw new Error('Installer update repository does not match release repository');
    return pkg.version;
}

export function isNewer(left, right) {
    const a = left.split('.').map(Number), b = right.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}

export function verifyArtifacts(directory, version) {
    const groups = ['folia-windows-latest', 'folia-ubuntu-latest', 'folia-macos-latest'];
    const files = new Map();
    for (const group of groups) {
        const groupDir = path.join(directory, group);
        const names = [];
        const walk = folder => {
            for (const entry of readdirSync(folder, { withFileTypes: true })) {
                const file = path.join(folder, entry.name);
                if (entry.isDirectory()) walk(file);
                else if (entry.isFile()) {
                    if (!/\.(?:exe|dmg|zip|AppImage|deb|rpm|tar\.gz|blockmap|yml)$/.test(entry.name)
                        || entry.name === 'builder-debug.yml') throw new Error(`Unexpected artifact file: ${entry.name}`);
                    if (files.has(entry.name)) throw new Error(`Duplicate release asset: ${entry.name}`);
                    files.set(entry.name, file);
                    names.push(entry.name);
                } else throw new Error('Symlinks and special files are not valid release assets');
            }
        };
        walk(groupDir);
        const required = group.includes('windows') ? ['.exe', 'latest.yml']
            : group.includes('macos') ? ['.dmg', '.zip', 'latest-mac.yml'] : ['.deb', '.rpm', '.tar.gz'];
        for (const suffix of required) if (!names.some(name => name.endsWith(suffix))) {
            throw new Error(`Missing ${suffix} in ${group}`);
        }
    }
    // Check every advertised updater payload against the actual downloaded bytes.
    for (const [name, file] of files) {
        if (!name.endsWith('.yml')) continue;
        const metadata = yaml.load(readFileSync(file, 'utf8'));
        if (metadata?.version !== version || !Array.isArray(metadata.files) || !metadata.files.length) {
            throw new Error(`Invalid update metadata or version: ${name}`);
        }
        for (const item of metadata.files) {
            if (typeof item.url !== 'string' || /[/\\]/.test(item.url)) throw new Error('Updater assets must be local filenames');
            const target = files.get(decodeURIComponent(item.url));
            if (!target) throw new Error(`Missing updater payload: ${item.url}`);
            const bytes = readFileSync(target);
            if (createHash('sha512').update(bytes).digest('base64') !== item.sha512
                || (item.size !== undefined && item.size !== bytes.length)) throw new Error(`Updater checksum mismatch: ${item.url}`);
        }
        if (metadata.path && metadata.sha512) {
            const target = files.get(metadata.path);
            if (!target || createHash('sha512').update(readFileSync(target)).digest('base64') !== metadata.sha512) {
                throw new Error(`Legacy updater checksum mismatch: ${name}`);
            }
        }
    }
    return files;
}

/** Upload into a draft first; an upload failure must never expose an incomplete update. */
export function publishVerifiedRelease(gh, { repository, tag, sha, title, notesFile, files, existing }) {
    if (existing && !existing.draft) throw new Error('Published releases are immutable; increase the version');
    if (existing && existing.target_commitish !== sha) throw new Error('Existing draft has a different source commit');
    if (!existing) gh(['release', 'create', tag, '--repo', repository, '--target', sha,
        '--title', title, '--notes-file', notesFile, '--draft']);
    gh(['release', 'upload', tag, ...files, '--repo', repository, '--clobber']);
    gh(['release', 'edit', tag, '--repo', repository, '--notes-file', notesFile, '--draft=false', '--latest']);
}

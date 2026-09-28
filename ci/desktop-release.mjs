import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isNewer, publishVerifiedRelease, validatePackage, validateRun, verifyArtifacts } from './desktop-release-core.mjs';

// ci/desktop-release.mjs
// Promote the existing installers; their tag points to the build commit, not this workflow commit.
const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Missing repository');
const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const api = endpoint => JSON.parse(gh(['api', `repos/${repository}/${endpoint}`]));
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
const existingRelease = tag => {
    const result = spawnSync('gh', ['api', `repos/${repository}/releases/tags/${tag}`], { encoding: 'utf8' });
    if (!result.status) return JSON.parse(result.stdout);
    if (result.stderr.includes('HTTP 404')) return null;
    throw new Error(result.stderr || 'Cannot read release');
};

if (process.argv[2] === 'plan') {
    let id = process.env.SOURCE_RUN_ID;
    if (!id) {
        const runs = api('actions/workflows/desktop-build.yml/runs?branch=main&status=success&per_page=20').workflow_runs;
        id = runs.find(run => ['push', 'workflow_dispatch'].includes(run.event))?.id;
    }
    if (!/^\d+$/.test(String(id ?? ''))) throw new Error('No completed desktop build is available');
    const run = validateRun(api(`actions/runs/${id}`), repository);
    const content = api(`contents/package.json?ref=${run.head_sha}`);
    const pkg = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
    const version = validatePackage(pkg, repository), tag = `v${version}`;
    const existing = existingRelease(tag);
    const publicReleases = api('releases?per_page=100').filter(release => !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name));
    if ((existing && !existing.draft) || publicReleases.some(release => !isNewer(version, release.tag_name))) {
        console.log(`Skip ${tag}: this version, or a newer version, is already published.`);
        output('publish', 'false');
        process.exit(0);
    }
    const artifacts = api(`actions/runs/${id}/artifacts?per_page=100`).artifacts;
    for (const name of ['folia-windows-latest', 'folia-ubuntu-latest', 'folia-macos-latest']) {
        if (artifacts.filter(artifact => artifact.name === name && !artifact.expired).length !== 1) throw new Error(`Missing or expired artifact: ${name}`);
    }
    mkdirSync('.release', { recursive: true });
    writeFileSync('.release/plan.json', JSON.stringify({ repository, tag, version, sha: run.head_sha, runId: run.id }));
    output('publish', 'true');
    output('run_id', run.id);
    console.log(`Verified source: ${run.html_url} → ${tag} (${run.head_sha})`);
} else if (process.argv[2] === 'publish') {
    const plan = JSON.parse(readFileSync('.release/plan.json', 'utf8'));
    if (plan.repository !== repository) throw new Error('Repository changed during release');
    const assets = verifyArtifacts('.release/artifacts', plan.version);
    const sums = [...assets].map(([name, file]) => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`).join('\n');
    writeFileSync('.release/SHA256SUMS', `${sums}\n`);
    const template = readFileSync('docs/desktop/fork-release-notes.md', 'utf8');
    writeFileSync('.release/notes.md', template.replaceAll('{{VERSION}}', plan.version)
        + `\n\n构建来源：[GitHub Actions](https://github.com/${repository}/actions/runs/${plan.runId}) · [源码](https://github.com/${repository}/commit/${plan.sha})\n`);
    const existing = existingRelease(plan.tag);
    // A pre-existing tag must describe exactly the binaries we are about to publish.
    const tagRef = spawnSync('gh', ['api', `repos/${repository}/git/ref/tags/${plan.tag}`], { encoding: 'utf8' });
    if (!tagRef.status) {
        let object = JSON.parse(tagRef.stdout).object;
        for (let depth = 0; object.type === 'tag' && depth < 8; depth++) object = api(`git/tags/${object.sha}`).object;
        if (object.type !== 'commit' || object.sha !== plan.sha) throw new Error('Existing tag points to different source; refusing to overwrite it');
    } else if (!tagRef.stderr.includes('HTTP 404')) throw new Error(tagRef.stderr);
    publishVerifiedRelease(gh, { ...plan, title: `Folia ${plan.tag} · Music Party`, notesFile: '.release/notes.md', existing,
        files: [...assets.values(), path.resolve('.release/SHA256SUMS')] });
    console.log(`Published https://github.com/${repository}/releases/tag/${plan.tag}`);
} else throw new Error('Use plan or publish');

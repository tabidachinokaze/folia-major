import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isNewer, publishVerifiedRelease, validatePackage, validateRun, verifyArtifacts } from './desktop-release-core.mjs';

// ci/desktop-release.test.mjs
const directories = [];
afterEach(() => { directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })); });
const repository = 'tabidachinokaze/folia-major';
const run = { id: 123, head_repository: { full_name: repository }, head_branch: 'main',
    event: 'push', path: '.github/workflows/desktop-build.yml', status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40) };
const pkg = { version: '0.7.9', build: { publish: [{ provider: 'github', owner: 'tabidachinokaze', repo: 'folia-major' }] } };

function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'folia-release-test-'));
    directories.push(root);
    for (const group of ['windows', 'ubuntu', 'macos']) mkdirSync(path.join(root, `folia-${group}-latest`));
    const put = (group, name, bytes = Buffer.from(name)) => {
        const file = path.join(root, `folia-${group}-latest`, name);
        writeFileSync(file, bytes); return file;
    };
    const metadata = (group, filename, target) => {
        const bytes = Buffer.from(target);
        put(group, filename, `version: 0.7.9\nfiles:\n  - url: ${target}\n    sha512: ${createHash('sha512').update(bytes).digest('base64')}\n    size: ${bytes.length}\n`);
    };
    put('windows', 'Folia-Setup-0.7.9.exe'); metadata('windows', 'latest.yml', 'Folia-Setup-0.7.9.exe');
    put('macos', 'Folia-0.7.9-arm64.dmg'); put('macos', 'Folia-0.7.9-arm64.zip'); metadata('macos', 'latest-mac.yml', 'Folia-0.7.9-arm64.zip');
    for (const ext of ['deb', 'rpm', 'tar.gz']) put('ubuntu', `folia-0.7.9.${ext}`);
    return { root, put };
}

test('only a completed, successful same-repository main build can be promoted', () => {
    assert.equal(validateRun(run, repository), run);
    for (const patch of [{ conclusion: 'failure' }, { event: 'pull_request' }, { head_branch: 'feature' },
        { head_repository: { full_name: 'someone/folia-major' } }, { path: '.github/workflows/another.yml' }, { head_sha: 'main' }]) {
        assert.throws(() => validateRun({ ...run, ...patch }, repository));
    }
});

test('package version and update destination must agree with the release', () => {
    assert.equal(validatePackage(pkg, repository), '0.7.9');
    assert.throws(() => validatePackage({ ...pkg, version: '0.7.9-beta.1' }, repository));
    assert.throws(() => validatePackage(pkg, 'chthollyphile/folia-major'));
    assert.equal(isNewer('0.7.10', 'v0.7.9'), true);
    assert.equal(isNewer('0.7.9', 'v0.7.9'), false);
    assert.equal(isNewer('0.7.9', 'v0.8.0'), false);
});

test('complete platform bundles with matching updater hashes pass', () => {
    const { root } = fixture();
    assert.equal(verifyArtifacts(root, '0.7.9').size, 8);
    assert.throws(() => verifyArtifacts(root, '0.7.10'), /version/);
});

test('a missing platform package blocks publication', () => {
    const { root } = fixture();
    rmSync(path.join(root, 'folia-ubuntu-latest', 'folia-0.7.9.rpm'));
    assert.throws(() => verifyArtifacts(root, '0.7.9'), /Missing .rpm/);
});

test('tampered payloads and duplicate filenames cannot be published', () => {
    const { root, put } = fixture();
    put('windows', 'Folia-Setup-0.7.9.exe', 'wrong bytes');
    assert.throws(() => verifyArtifacts(root, '0.7.9'), /checksum/);
    put('macos', 'Folia-Setup-0.7.9.exe');
    assert.throws(() => verifyArtifacts(root, '0.7.9'), /Duplicate/);
});

test('updater references cannot escape the release assets', () => {
    const { root, put } = fixture();
    put('windows', 'latest.yml', readFileSync(path.join(root, 'folia-windows-latest', 'latest.yml'), 'utf8').replace('url: Folia', 'url: ../Folia'));
    assert.throws(() => verifyArtifacts(root, '0.7.9'), /local filenames/);
});

const release = { repository, tag: 'v0.7.9', sha: run.head_sha, title: 'Folia', notesFile: 'notes.md', files: ['app.exe'], existing: null };
test('a release stays a draft until every asset is uploaded', () => {
    const calls = [];
    publishVerifiedRelease(args => calls.push(args), release);
    assert.deepEqual(calls.map(args => args[1]), ['create', 'upload', 'edit']);
    assert.ok(calls[0].includes('--draft'));
    assert.ok(calls[2].includes('--draft=false'));
    const failed = [];
    assert.throws(() => publishVerifiedRelease(args => { failed.push(args); if (args[1] === 'upload') throw new Error('upload failed'); }, release));
    assert.deepEqual(failed.map(args => args[1]), ['create', 'upload']);
});

test('retry accepts the same draft but refuses public or mismatched releases', () => {
    const calls = [];
    publishVerifiedRelease(args => calls.push(args), { ...release, existing: { draft: true, target_commitish: run.head_sha } });
    assert.deepEqual(calls.map(args => args[1]), ['upload', 'edit']);
    assert.throws(() => publishVerifiedRelease(() => {}, { ...release, existing: { draft: false } }), /immutable/);
    assert.throws(() => publishVerifiedRelease(() => {}, { ...release, existing: { draft: true, target_commitish: 'b'.repeat(40) } }), /different source/);
});

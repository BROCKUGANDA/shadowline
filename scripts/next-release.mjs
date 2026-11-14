#!/usr/bin/env node
/**
 * Compute the next semantic version from conventional commits since the
 * latest v* tag. Prints one line: `vX.Y.Z`, or `none` when nothing to release.
 *
 * Rules:
 *   feat                                   -> minor bump
 *   fix, perf, refactor, docs, ci, test,
 *   build, chore, style, revert            -> patch bump
 *   feat!:/fix!:/breaking/BREAKING CHANGE  -> major bump
 *   no conventional commit found            -> none
 *   no tags yet                             -> package.json version + bump (or .0)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const latestTag = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n')[0] || '';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

let range = 'HEAD';
if (latestTag) range = `${latestTag}..HEAD`;

const subjects = range === 'HEAD'
  ? git('log', '--format=%s').split('\n').filter(Boolean)
  : git('log', '--format=%s', range).split('\n').filter(Boolean);

let major = 0, minor = 0, patch = 0;
for (const s of subjects) {
  const isBreaking = /!\s*:|BREAKING CHANGE/.test(s);
  const m = s.match(/^(feat|fix|perf|refactor|docs|ci|test|build|chore|style|revert)(\([^)]*\))?!?:/i);
  if (isBreaking) major += 1;
  else if (m && m[1].toLowerCase() === 'feat') minor += 1;
  else if (m) patch += 1;
}

const base = latestTag ? latestTag.replace(/^v/, '').split('.').map(Number) : pkg.version.replace(/^v/, '').split('.').map(Number);
if (!latestTag && subjects.length === 0) {
  console.log(`v${base.join('.')}`);
  process.exit(0);
}
if (major > 0) {
  console.log(`v${base[0] + 1}.0.0`);
} else if (minor > 0) {
  console.log(`v${base[0]}.${base[1] + 1}.0`);
} else if (patch > 0) {
  console.log(`v${base[0]}.${base[1]}.${base[2] + 1}`);
} else {
  console.log('none');
}

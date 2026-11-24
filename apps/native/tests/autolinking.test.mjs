import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('expo-modules-autolinking/package.json'));
const result = JSON.parse(execFileSync(process.execPath, [
  resolve(root, 'bin/expo-modules-autolinking.js'),
  'resolve', '--platform', 'android', '--json',
], { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' }));
assert.ok(result.modules.length > 0, 'Expected native modules to be linked');
const font = result.modules.find(m => m.packageName === 'expo-font');
assert.ok(font, 'expo-font must be linked');
const expected = require('expo/bundledNativeModules.json')['expo-font'];
assert.ok(require('semver').satisfies(font.packageVersion, expected),
  `expo-font ${font.packageVersion} is incompatible with this SDK (${expected})`);
for (const module of result.modules) {
  for (const project of module.projects || []) {
    if (!project.publication) continue;
    for (const field of ['groupId', 'artifactId', 'version']) {
      assert.ok(typeof project.publication[field] === 'string' && project.publication[field].length,
        `${module.packageName}: publication.${field} is required by the Expo Gradle plugin`);
    }
  }
}
console.log('Android autolinking metadata and SDK font compatibility passed.');

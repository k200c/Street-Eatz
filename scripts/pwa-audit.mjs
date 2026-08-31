import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicDir = resolve(root, 'public');
const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf8'));
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const offlineHtml = readFileSync(resolve(publicDir, 'offline.html'), 'utf8');
const serviceWorker = readFileSync(resolve(publicDir, 'sw.js'), 'utf8');
const netlifyConfig = readFileSync(resolve(root, 'netlify.toml'), 'utf8');

function pngDimensions(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `${path} is not a PNG file`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

assert.equal(manifest.id, '/', 'Manifest id must remain stable');
assert.equal(manifest.scope, '/', 'Manifest scope must cover customer routes');
assert.match(manifest.start_url, /^\/(?!admin)/, 'Installed app must not start in staff administration');
assert.equal(manifest.display, 'standalone', 'Manifest must request standalone display');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'), '192px any-purpose icon missing');
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'), '512px any-purpose icon missing');
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'), '512px maskable icon missing');

for (const icon of manifest.icons) {
  const path = resolve(publicDir, icon.src.replace(/^\//, ''));
  assert.ok(existsSync(path), `Manifest icon does not exist: ${icon.src}`);
  const [expectedWidth, expectedHeight] = icon.sizes.split('x').map(Number);
  assert.deepEqual(pngDimensions(path), { width: expectedWidth, height: expectedHeight }, `Manifest icon dimensions do not match ${icon.sizes}: ${icon.src}`);
}
assert.match(netlifyConfig, /application\/manifest\+json/, 'Netlify must serve the manifest with its correct content type');
assert.match(netlifyConfig, /Service-Worker-Allowed\s*=\s*"\/"/, 'Netlify must allow the root service-worker scope');
assert.match(netlifyConfig, /max-age=0, must-revalidate/, 'Service-worker responses must revalidate on every load');

for (const asset of ['apple-touch-icon-v2.png', 'favicon-32x32-v2.png', 'favicon-16x16-v2.png']) {
  assert.ok(existsSync(resolve(publicDir, asset)), `Referenced browser icon is missing: ${asset}`);
  assert.match(html, new RegExp(asset.replace('.', '\\.')), `index.html does not reference ${asset}`);
}

assert.doesNotMatch(html, /user-scalable\s*=\s*no/i, 'Viewport must allow customer zoom');
assert.doesNotMatch(html, /maximum-scale\s*=\s*1/i, 'Viewport must allow customer zoom');
assert.doesNotMatch(offlineHtml, /user-scalable\s*=\s*no/i, 'Offline viewport must allow customer zoom');
assert.match(serviceWorker, /offline\.html/, 'Service worker must retain an offline fallback');
for (const icon of manifest.icons) {
  assert.match(serviceWorker, new RegExp(icon.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Service worker does not precache ${icon.src}`);
}

console.log(`PWA audit passed: ${manifest.name}, ${manifest.icons.length} manifest icons, accessible viewport.`);

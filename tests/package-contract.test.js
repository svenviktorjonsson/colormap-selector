import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import ColormapSelector from 'colormap-selector';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);
const source = await readFile(
  new URL('../src/ColormapSelector.js', import.meta.url),
  'utf8'
);
const styles = await readFile(
  new URL('../dist/style.css', import.meta.url),
  'utf8'
);

test('exports the selector and its stylesheet from stable package paths', () => {
  assert.equal(typeof ColormapSelector, 'function');
  assert.equal(packageJson.exports['.'], './src/ColormapSelector.js');
  assert.equal(packageJson.exports['./style.css'], './dist/style.css');
});

test('owns pointer input through one mouse and touch interaction path', () => {
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /addEventListener\('pointermove'/);
  assert.match(source, /addEventListener\('pointerup'/);
  assert.doesNotMatch(source, /addEventListener\('mousedown'/);
  assert.doesNotMatch(source, /addEventListener\('mousemove'/);
  assert.doesNotMatch(source, /addEventListener\('mouseup'/);
  assert.match(source, /destroy\(\)/);
  assert.match(source, /_resizeObserver\?\.disconnect\(\)/);
});

test('scopes interaction styles and provides tablet and three-page phone presentations', () => {
  assert.doesNotMatch(styles, /(?:^|\n)body\s*\{/);
  assert.doesNotMatch(styles, /(?:^|\n)\.(?!color-editor-layout)[a-z][^{,\n]*\{/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1100px\)/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /width:\s*300%/);
  assert.match(styles, /height:\s*clamp\(300px,\s*50dvh,\s*420px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /#colormap-selector-wrapper #current-colormap-section\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(styles, /#colormap-selector-wrapper #current-colormap-section\s*\{[^}]*touch-action:\s*pan-y/);
  assert.match(styles, /\.colormap-selector-viewport\s*\{[^}]*touch-action:\s*pan-x pan-y/);
  assert.match(styles, /#current-colormap-section \.button-container\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(source, /const MOBILE_MASTERS_PAGE = 2/);
  assert.match(source, /initialPage \* this\.elements\.mobileViewport\.clientWidth/);
});

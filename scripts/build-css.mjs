import { readFile, writeFile } from 'node:fs/promises';

import postcss from 'postcss';
import prefixSelector from 'postcss-prefix-selector';

const packageRoot = new URL('../', import.meta.url);
const sourcePath = new URL('src/style.css', packageRoot);
const outputPath = new URL('dist/style.css', packageRoot);
const wrapper = '#colormap-selector-wrapper';

const source = await readFile(sourcePath, 'utf8');
const result = await postcss([
  prefixSelector({
    prefix: wrapper,
    transform(prefix, selector, prefixedSelector) {
      if (selector.startsWith(wrapper)) return selector;
      return prefixedSelector;
    }
  })
]).process(source, { from: sourcePath.pathname, to: outputPath.pathname });

await writeFile(outputPath, result.css);

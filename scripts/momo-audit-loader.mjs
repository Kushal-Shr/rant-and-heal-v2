// Resolve existing application aliases without changing production modules.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    let path;
    if (specifier.startsWith('@/')) path = resolve(root, specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      path = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (path && !extname(path) && existsSync(`${path}.ts`)) {
      return nextResolve(pathToFileURL(`${path}.ts`).href, context);
    }
    return nextResolve(specifier, context);
  },
});

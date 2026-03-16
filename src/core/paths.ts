import path from 'node:path';

import type { Options, ResolvedOptions } from '../types';

export function resolveOptions(root: string, options: Options = {}): ResolvedOptions {
  const interfaceDir = path.resolve(root, options.dir ?? 'resources/js/interfaces');
  const outputFile = path.resolve(root, options.out ?? 'resources/js/types/interfaces.d.ts');
  const excludeFiles = new Set(options.exclude);

  return { interfaceDir, outputFile, excludeFiles };
}

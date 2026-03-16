import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedOptions } from '../types';

const RE_INTERFACE = /^export\s+interface\s+([A-Za-z_$][\w$]*)/gm;
const RE_NAMED_EXPORT = /export\s*\{([^}]+)\}/g;
const RE_TYPE_EXPORT = /export\s+type\s*\{([^}]+)\}/g;
const RE_AS_SPLIT = /\s+as\s+/;

export interface GenerateResult {
  files: number;
  interfaces: number;
}

export function generateInterfaces(opts: ResolvedOptions): GenerateResult {
  const { interfaceDir, outputFile, excludeFiles } = opts;

  const files = fs
    .readdirSync(interfaceDir)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts' && !excludeFiles.has(file));

  const interfaces: { file: string; names: string[] }[] = [];

  for (const file of files) {
    const filePath = path.join(interfaceDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Find exported interfaces: export interface Name (single line only)
    const interfaceMatches = [...content.matchAll(RE_INTERFACE)];
    const interfaceNames = interfaceMatches.map((match) => match[1]);

    // Find named exports: export { Name1, Name2 } (but not export type { })
    const namedExportMatches = [...content.matchAll(RE_NAMED_EXPORT)];
    const namedExportNames = namedExportMatches
      .filter(
        (match) => !content.substring(Math.max(0, match.index! - 10), match.index!).includes('type')
      )
      .flatMap((match) =>
        match[1]
          .split(',')
          .map((item) => item.trim().split(RE_AS_SPLIT)[0].trim())
          .filter((name) => name.length > 0)
      );

    // Find typed exports: export type { Name1, Name2 }
    const typeExportMatches = [...content.matchAll(RE_TYPE_EXPORT)];
    const typeExportNames = typeExportMatches.flatMap((match) =>
      match[1]
        .split(',')
        .map((item) => item.trim().split(RE_AS_SPLIT)[0].trim())
        .filter((name) => name.length > 0)
    );

    // Remove duplicates and filter out empty names
    const allNames = [...interfaceNames, ...namedExportNames, ...typeExportNames];
    const names = [...new Set(allNames)].filter((name) => name && name !== 'export');

    if (names.length) {
      interfaces.push({ file, names });
    }
  }

  // interfaces.d.ts - clean global types with inline imports
  const globalLines = [
    'declare global {',
    ...interfaces.flatMap((iface) =>
      iface.names.map(
        (name) =>
          `  type ${name} = import('../interfaces/${path.basename(iface.file, '.ts')}').${name};`
      )
    ),
    '}',
    '',
    'export {};',
    '',
  ];
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, globalLines.join('\n'), 'utf8');

  return { files: files.length, interfaces: interfaces.flatMap((iface) => iface.names).length };
}

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
  skipped?: boolean;
}

function parseNames(content: string): string[] {
  const interfaceNames = [...content.matchAll(RE_INTERFACE)].map((match) => match[1]);

  const namedExportNames = [...content.matchAll(RE_NAMED_EXPORT)]
    .filter(
      (match) => !content.substring(Math.max(0, match.index! - 10), match.index!).includes('type')
    )
    .flatMap((match) =>
      match[1]
        .split(',')
        .map((item) => item.trim().split(RE_AS_SPLIT)[0].trim())
        .filter((name) => name.length > 0)
    );

  const typeExportNames = [...content.matchAll(RE_TYPE_EXPORT)].flatMap((match) =>
    match[1]
      .split(',')
      .map((item) => item.trim().split(RE_AS_SPLIT)[0].trim())
      .filter((name) => name.length > 0)
  );

  return [...new Set([...interfaceNames, ...namedExportNames, ...typeExportNames])].filter(
    (name) => name && name !== 'export'
  );
}

export async function generateInterfaces(opts: ResolvedOptions): Promise<GenerateResult> {
  const { interfaceDir, outputFile, excludeFiles } = opts;

  const allFiles = await fs.promises.readdir(interfaceDir);
  const files = allFiles.filter(
    (file) => file.endsWith('.ts') && file !== 'index.ts' && !excludeFiles.has(file)
  );

  // mtime-based cache: skip if output is newer than all interface files
  try {
    const outputStat = await fs.promises.stat(outputFile);
    const outputMtime = outputStat.mtimeMs;
    const mtimes = await Promise.all(
      files.map((file) =>
        fs.promises.stat(path.join(interfaceDir, file)).then((stat) => stat.mtimeMs)
      )
    );
    if (mtimes.every((mtime) => mtime <= outputMtime)) {
      return { files: files.length, interfaces: 0, skipped: true };
    }
  } catch {
    // output file doesn't exist yet — continue
  }

  const contents = await Promise.all(
    files.map((file) => fs.promises.readFile(path.join(interfaceDir, file), 'utf8'))
  );

  const interfaces: { file: string; names: string[] }[] = [];
  for (const [idx, file] of files.entries()) {
    const names = parseNames(contents[idx]);
    if (names.length) {
      interfaces.push({ file, names });
    }
  }

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

  await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.promises.writeFile(outputFile, globalLines.join('\n'), 'utf8');

  return { files: files.length, interfaces: interfaces.flatMap((iface) => iface.names).length };
}

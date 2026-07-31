import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedOptions } from '../types';

const RE_INTERFACE = /^export\s+interface\s+(?<name>[A-Za-z_$][\w$]*)/gm;
const RE_NAMED_EXPORT = /export\s*\{(?<specifiers>[^}]*)\}/g;
const RE_TYPE_EXPORT = /export\s+type\s*\{(?<specifiers>[^}]*)\}/g;
const RE_AS_SPLIT = /\s+as\s+/;
const RE_TYPE_MODIFIER = /^type\s+/;
const RE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

// `default` ist ein gueltiger Export-Name, aber kein gueltiger Typname --
// `type default = ...` waere ein Syntaxfehler in der generierten d.ts.
const RESERVED_EXPORT_NAMES = new Set(['default']);

export interface GenerateResult {
  files: number;
  interfaces: number;
  skipped?: boolean;
}

/**
 * Zerlegt die Specifier-Liste einer `export { ... }`-Klausel in die Namen,
 * unter denen die Typen von aussen sichtbar sind.
 */
function parseSpecifiers(specifierList: string): string[] {
  return specifierList
    .split(',')
    .map((specifier) => {
      // Bei `Foo as Bar` zaehlt der exportierte Name (Bar) -- nur ueber den
      // ist der Typ via `import('...').Bar` erreichbar, nicht ueber den
      // dateiinternen Namen.
      const segments = specifier.trim().split(RE_AS_SPLIT);
      const exported = segments[segments.length - 1].trim();

      // Inline-Modifier abstreifen: `export { type Foo }` exportiert `Foo`.
      return exported.replace(RE_TYPE_MODIFIER, '').trim();
    })
    .filter((name) => name.length > 0);
}

function parseNames(content: string): string[] {
  const interfaceNames = [...content.matchAll(RE_INTERFACE)].map((match) => match[1]);

  const namedExportNames = [...content.matchAll(RE_NAMED_EXPORT)].flatMap((match) =>
    parseSpecifiers(match[1])
  );

  const typeExportNames = [...content.matchAll(RE_TYPE_EXPORT)].flatMap((match) =>
    parseSpecifiers(match[1])
  );

  return [...new Set([...interfaceNames, ...namedExportNames, ...typeExportNames])].filter(
    (name) => RE_IDENTIFIER.test(name) && !RESERVED_EXPORT_NAMES.has(name)
  );
}

/**
 * mtime-Cache: neu generiert wird nur, wenn sich seit dem letzten Schreiben
 * etwas geaendert hat. Neben den Dateien selbst zaehlt dabei die mtime des
 * Verzeichnisses -- die springt beim Anlegen und beim Loeschen einer Datei.
 * Ohne diesen Teil bliebe nach einem `unlink` der Typ einer geloeschten
 * Interface-Datei in der generierten d.ts stehen: die verbliebenen Dateien
 * sind alle aelter als das Output, der Lauf wuerde uebersprungen.
 */
async function isUpToDate(
  interfaceDir: string,
  outputFile: string,
  files: string[]
): Promise<boolean> {
  try {
    const [outputStat, dirStat] = await Promise.all([
      fs.promises.stat(outputFile),
      fs.promises.stat(interfaceDir),
    ]);

    if (dirStat.mtimeMs > outputStat.mtimeMs) {
      return false;
    }

    const mtimes = await Promise.all(
      files.map((file) =>
        fs.promises.stat(path.join(interfaceDir, file)).then((stat) => stat.mtimeMs)
      )
    );

    return mtimes.every((mtime) => mtime <= outputStat.mtimeMs);
  } catch {
    // Output existiert noch nicht -- generieren.
    return false;
  }
}

export async function generateInterfaces(opts: ResolvedOptions): Promise<GenerateResult> {
  const { interfaceDir, outputFile, excludeFiles } = opts;

  const allFiles = await fs.promises.readdir(interfaceDir);
  // Sortiert, damit die Ausgabe unabhaengig von der readdir-Reihenfolge des
  // Dateisystems reproduzierbar bleibt -- sonst wackelt sie zwischen Linux,
  // macOS und Windows.
  const files = allFiles
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.d.ts') &&
        file !== 'index.ts' &&
        !excludeFiles.has(file)
    )
    .toSorted();

  if (await isUpToDate(interfaceDir, outputFile, files)) {
    return { files: files.length, interfaces: 0, skipped: true };
  }

  const contents = await Promise.all(
    files.map((file) => fs.promises.readFile(path.join(interfaceDir, file), 'utf8'))
  );

  // Global eindeutig halten: zwei Dateien duerfen denselben Namen exportieren
  // (Re-Export, gleichnamiges Interface), aber `declare global` vertraegt
  // keine zwei `type X`-Deklarationen -- TypeScript meldet sonst
  // "Duplicate identifier". Die alphabetisch erste Datei gewinnt.
  const seen = new Set<string>();
  const interfaces: { file: string; names: string[] }[] = [];

  for (const [idx, file] of files.entries()) {
    const names = parseNames(contents[idx]).filter((name) => !seen.has(name));

    for (const name of names) {
      seen.add(name);
    }

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

// oxlint-disable no-console -- ein Pruefskript, dessen Ergebnis die Konsole ist.
/**
 * Prueft das gebaute Paket statt der Quellen.
 *
 * Die Unit- und Integrationstests importieren aus src/. Ausgeliefert wird aber
 * dist/, und dazwischen liegt die exports-Map der package.json -- eine
 * Fehlerquelle, die keine der beiden Testarten sieht. Genau dort lag schon
 * einmal ein Fehler: nach dem Umstieg auf tsdown 0.21 zeigten die Eintraege
 * noch auf .js, waehrend der Build .mjs erzeugte (siehe e5e1c85).
 *
 * Laeuft in CI nach dem Build auf allen drei Betriebssystemen.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const INDEX_EXPORTS = [
  'default',
  'unplugin',
  'unpluginFactory',
  'vite',
  'rollup',
  'webpack',
  'esbuild',
];

const failures = [];

function check(condition, message) {
  console.log(`  ${condition ? 'ok   ' : 'FEHLT'} ${message}`);

  if (!condition) {
    failures.push(message);
  }

  return condition;
}

function resolveTarget(target) {
  return path.join(ROOT, target);
}

async function loadEntry(target) {
  try {
    return { module: await import(pathToFileURL(resolveTarget(target)).href) };
  } catch (error) {
    return { error };
  }
}

console.log(`Pruefe gebautes Paket ${pkg.name}@${pkg.version}`);

// 1. Die Felder, ueber die aeltere Toolchains und Editoren einsteigen.
console.log('\nEinstiegsfelder');
for (const field of ['main', 'module', 'types']) {
  check(
    typeof pkg[field] === 'string' && fs.existsSync(resolveTarget(pkg[field])),
    `${field} -> ${pkg[field]}`
  );
}

// 2. Jeder exports-Eintrag muss auf eine gebaute Datei zeigen, die sich auch
//    laden laesst. Ein Eintrag, der nur auf dem Papier existiert, faellt sonst
//    erst beim Konsumenten auf.
const subpaths = Object.keys(pkg.exports).filter((subpath) => subpath !== './package.json');
const loaded = await Promise.all(subpaths.map((subpath) => loadEntry(pkg.exports[subpath])));

console.log('\nexports-Map');
for (const [index, subpath] of subpaths.entries()) {
  const target = pkg.exports[subpath];
  const result = loaded[index];

  if (check(fs.existsSync(resolveTarget(target)), `${subpath} -> ${target}`)) {
    if (result.error) {
      check(false, `${subpath} laedt (${result.error.message})`);
    } else if (subpath === '.') {
      for (const named of INDEX_EXPORTS) {
        const value = result.module[named];
        check(typeof value === 'function' || typeof value === 'object', `. exportiert ${named}`);
      }
    } else if (subpath === './types') {
      // Reines Typmodul: zur Laufzeit erwartungsgemaess leer.
      check(result.module !== undefined, `${subpath} laedt`);
    } else {
      check(typeof result.module.default === 'function', `${subpath} exportiert eine Factory`);
    }
  }
}

// 3. Zu jedem Einstiegspunkt gehoeren Typen -- ohne die ist das Paket fuer
//    TypeScript-Konsumenten faktisch untypisiert.
console.log('\nTypdeklarationen');
for (const subpath of subpaths) {
  const declaration = pkg.exports[subpath].replace(/\.mjs$/, '.d.mts');
  check(fs.existsSync(resolveTarget(declaration)), `${subpath} -> ${declaration}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} Pruefung(en) fehlgeschlagen.`);
  // exitCode statt exit(): laesst Node stdout noch leeren, bevor der Prozess
  // endet -- sonst fehlt in CI ausgerechnet die Fehlerausgabe.
  process.exitCode = 1;
} else {
  console.log('\nPaket in Ordnung.');
}

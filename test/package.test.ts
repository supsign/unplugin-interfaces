import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RE_ENTRY = /^\.\/dist\/(?<name>[\w$-]+)\.mjs$/;

/** Einstiegspunkte, die tsdown aus `entry: ['src/*.ts']` erzeugt. */
const sourceEntries = fs
  .readdirSync(path.join(ROOT, 'src'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => path.basename(file, '.ts'))
  .toSorted();

const exportSubpaths = Object.keys(pkg.exports).filter((subpath) => subpath !== './package.json');

// Diese Pruefungen brauchen kein dist/: sie vergleichen die exports-Map gegen
// die Quellen. Ob die Dateien danach wirklich gebaut wurden und sich laden
// lassen, prueft scripts/verifyDist.mjs -- das laeuft in CI nach dem Build.
describe('package.json', () => {
  it('exportiert jeden Einstiegspunkt aus src/', () => {
    const exported = exportSubpaths
      .map((subpath) => (subpath === '.' ? 'index' : subpath.slice(2)))
      .toSorted();

    expect(exported).toEqual(sourceEntries);
  });

  // Regression: nach dem Umstieg auf tsdown 0.21 zeigten die Eintraege noch
  // auf .js, waehrend der Build .mjs erzeugte (e5e1c85).
  it('zeigt mit jedem Eintrag auf eine .mjs-Datei in dist/', () => {
    for (const subpath of exportSubpaths) {
      const target = pkg.exports[subpath as keyof typeof pkg.exports];
      const match = RE_ENTRY.exec(target);

      expect(match, `${subpath} -> ${target}`).not.toBeNull();
      expect(match?.groups?.name).toBe(subpath === '.' ? 'index' : subpath.slice(2));
    }
  });

  it('laesst package.json selbst aufloesbar', () => {
    expect(pkg.exports['./package.json']).toBe('./package.json');
  });

  it('haelt main, module und types innerhalb von dist/', () => {
    for (const field of [pkg.main, pkg.module, pkg.types]) {
      expect(field).toMatch(/^\.\/dist\//);
    }
  });

  it('veroeffentlicht nur dist/', () => {
    expect(pkg.files).toEqual(['dist']);
  });

  // Ohne diese Zusage installiert npm das Paket auf Nodes, auf denen die
  // Runtime-Abhaengigkeiten gar nicht laufen -- unplugin verlangt selbst
  // ^20.19 || >=22.12.
  it('nennt die unterstuetzten Node-Versionen', () => {
    expect(pkg.engines?.node).toBe('^20.19.0 || >=22.12.0');
  });
});

import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateInterfaces } from '../src/core/generator';
import type { ResolvedOptions } from '../src/types';
import type { TempProject } from './support/tempProject';
import { backdate, createTempProject } from './support/tempProject';

function optionsFor(project: TempProject, exclude: string[] = []): ResolvedOptions {
  return {
    interfaceDir: project.interfaceDir,
    outputFile: project.outputFile,
    excludeFiles: new Set(exclude),
  };
}

/** Zieht die deklarierten Typnamen aus der generierten d.ts. */
function declaredTypes(output: string): string[] {
  return [...output.matchAll(/^ {2}type (?<name>[\w$]+) =/gm)].map((match) => match[1]);
}

describe('generateInterfaces – Erkennung von Exporten', () => {
  it('erfasst direkte `export interface`-Deklarationen', async () => {
    const project = await createTempProject({
      'user.ts': 'export interface User {\n  id: string;\n}\n',
    });

    const result = await generateInterfaces(optionsFor(project));

    expect(result).toEqual({ files: 1, interfaces: 1 });
    expect(await project.read()).toContain("type User = import('../interfaces/user').User;");
  });

  it('erfasst nachgelagerte `export { A, B }`-Listen', async () => {
    const project = await createTempProject({
      'user.ts': 'interface User {}\ninterface Profile {}\nexport { User, Profile };\n',
    });

    const result = await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual(['User', 'Profile']);
    expect(result.interfaces).toBe(2);
  });

  it('erfasst `export type { ... }`', async () => {
    const project = await createTempProject({
      'base.ts': 'interface Contact {}\ninterface License {}\nexport type { Contact, License };\n',
    });

    await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual(['Contact', 'License']);
  });

  it('nimmt bei `Foo as Bar` den exportierten Namen', async () => {
    const project = await createTempProject({
      'user.ts': 'interface InternalUser {}\nexport { InternalUser as User };\n',
    });

    await generateInterfaces(optionsFor(project));
    const output = await project.read();

    expect(output).toContain("type User = import('../interfaces/user').User;");
    expect(output).not.toContain('InternalUser');
  });

  it('nimmt auch bei `export type { Foo as Bar }` den exportierten Namen', async () => {
    const project = await createTempProject({
      'base.ts': 'interface Contact {}\nexport type { Contact as ContactInfo };\n',
    });

    await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual(['ContactInfo']);
  });

  it('entfernt den Inline-Modifier aus `export { type Foo }`', async () => {
    const project = await createTempProject({
      'user.ts': 'interface User {}\ninterface Profile {}\nexport { type User, type Profile };\n',
    });

    await generateInterfaces(optionsFor(project));
    const output = await project.read();

    expect(declaredTypes(output)).toEqual(['User', 'Profile']);
    expect(output).not.toContain('type type');
  });

  it('ueberspringt `default`, das kein gueltiger Typname waere', async () => {
    const project = await createTempProject({
      'user.ts': 'interface User {}\nexport { User as default };\n',
    });

    const result = await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual([]);
    expect(result.interfaces).toBe(0);
  });

  it('dedupliziert einen Namen, der doppelt exportiert wird', async () => {
    const project = await createTempProject({
      'user.ts': 'export interface User {}\nexport { User };\nexport type { User };\n',
    });

    const result = await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual(['User']);
    expect(result.interfaces).toBe(1);
  });

  // Ein Re-Export laesst denselben Namen in zwei Dateien auftauchen. Zwei
  // `type Base`-Zeilen in `declare global` waeren ein Duplicate-identifier-
  // Fehler -- die alphabetisch erste Datei bekommt den Zuschlag.
  it('deklariert einen dateiuebergreifend doppelten Namen nur einmal', async () => {
    const project = await createTempProject({
      'aggregate.ts': "export { Base } from './base';\n",
      'base.ts': 'export interface Base {}\n',
    });

    const result = await generateInterfaces(optionsFor(project));
    const output = await project.read();

    expect(declaredTypes(output)).toEqual(['Base']);
    expect(output).toContain("type Base = import('../interfaces/aggregate').Base;");
    expect(result).toEqual({ files: 2, interfaces: 1 });
  });

  it('ignoriert `export {}` ohne Specifier', async () => {
    const project = await createTempProject({ 'empty.ts': 'export {};\n' });

    const result = await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual([]);
    expect(result).toEqual({ files: 1, interfaces: 0 });
  });

  it('erfasst keine eingerueckten Interfaces aus Namespaces', async () => {
    const project = await createTempProject({
      'ns.ts': 'declare namespace Api {\n  export interface Inner {}\n}\n',
    });

    await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual([]);
  });
});

describe('generateInterfaces – Dateiauswahl', () => {
  it('ueberspringt index.ts, .d.ts und Nicht-TypeScript-Dateien', async () => {
    const project = await createTempProject({
      'index.ts': 'export interface FromIndex {}\n',
      'globals.d.ts': 'export interface FromDts {}\n',
      'notes.md': 'export interface FromMarkdown {}\n',
      'user.ts': 'export interface User {}\n',
    });

    const result = await generateInterfaces(optionsFor(project));

    expect(result.files).toBe(1);
    expect(declaredTypes(await project.read())).toEqual(['User']);
  });

  it('respektiert exclude', async () => {
    const project = await createTempProject({
      'legacy.ts': 'export interface Legacy {}\n',
      'user.ts': 'export interface User {}\n',
    });

    const result = await generateInterfaces(optionsFor(project, ['legacy.ts']));

    expect(result.files).toBe(1);
    expect(declaredTypes(await project.read())).toEqual(['User']);
  });

  it('liefert eine stabile, alphabetisch sortierte Reihenfolge', async () => {
    const project = await createTempProject({
      'zulu.ts': 'export interface Zulu {}\n',
      'alpha.ts': 'export interface Alpha {}\n',
      'mike.ts': 'export interface Mike {}\n',
    });

    await generateInterfaces(optionsFor(project));

    expect(declaredTypes(await project.read())).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('zaehlt Dateien ohne Exporte mit, deklariert aber nichts', async () => {
    const project = await createTempProject({
      'helpers.ts': 'const noop = () => undefined;\n',
      'user.ts': 'export interface User {}\n',
    });

    const result = await generateInterfaces(optionsFor(project));

    expect(result).toEqual({ files: 2, interfaces: 1 });
  });

  it('schreibt bei leerem Verzeichnis ein gueltiges, leeres Modul', async () => {
    const project = await createTempProject();

    const result = await generateInterfaces(optionsFor(project));

    expect(result).toEqual({ files: 0, interfaces: 0 });
    expect(await project.read()).toBe('declare global {\n}\n\nexport {};\n');
  });

  it('wirft, wenn das Interface-Verzeichnis fehlt', async () => {
    const project = await createTempProject();
    const missing = { ...optionsFor(project), interfaceDir: path.join(project.root, 'nope') };

    await expect(generateInterfaces(missing)).rejects.toThrow();
  });
});

describe('generateInterfaces – Ausgabe', () => {
  it('legt fehlende Zielverzeichnisse an', async () => {
    const project = await createTempProject({ 'user.ts': 'export interface User {}\n' });
    const nested = {
      ...optionsFor(project),
      outputFile: path.join(project.root, 'deeply', 'nested', 'interfaces.d.ts'),
    };

    await generateInterfaces(nested);

    await expect(fs.readFile(nested.outputFile, 'utf8')).resolves.toContain('declare global');
  });

  it('umschliesst die Deklarationen mit declare global und export {}', async () => {
    const project = await createTempProject({ 'user.ts': 'export interface User {}\n' });

    await generateInterfaces(optionsFor(project));

    expect(await project.read()).toBe(
      [
        'declare global {',
        "  type User = import('../interfaces/user').User;",
        '}',
        '',
        'export {};',
        '',
      ].join('\n')
    );
  });
});

describe('generateInterfaces – mtime-Cache', () => {
  it('ueberspringt den Lauf, wenn nichts neuer ist als die Ausgabe', async () => {
    const project = await createTempProject({ 'user.ts': 'export interface User {}\n' });

    await generateInterfaces(optionsFor(project));
    await backdate(project);
    const second = await generateInterfaces(optionsFor(project));

    expect(second).toEqual({ files: 1, interfaces: 0, skipped: true });
  });

  it('generiert neu, wenn eine Datei geaendert wurde', async () => {
    const project = await createTempProject({ 'user.ts': 'export interface User {}\n' });

    await generateInterfaces(optionsFor(project));
    await backdate(project);
    await project.write('user.ts', 'export interface User {}\nexport interface Profile {}\n');
    const second = await generateInterfaces(optionsFor(project));

    expect(second.skipped).toBeUndefined();
    expect(declaredTypes(await project.read())).toEqual(['User', 'Profile']);
  });

  it('generiert neu, wenn eine Datei dazukommt', async () => {
    const project = await createTempProject({ 'user.ts': 'export interface User {}\n' });

    await generateInterfaces(optionsFor(project));
    await backdate(project);
    await project.write('task.ts', 'export interface Task {}\n');
    const second = await generateInterfaces(optionsFor(project));

    expect(second).toEqual({ files: 2, interfaces: 2 });
    expect(declaredTypes(await project.read())).toEqual(['Task', 'User']);
  });

  // Regression: zuvor entschied nur die mtime der verbliebenen Dateien. Nach
  // einem Loeschen war keine davon neuer als die Ausgabe -- der Lauf wurde
  // uebersprungen und der Typ der geloeschten Datei blieb global sichtbar.
  it('generiert neu, wenn eine Datei geloescht wurde, und entfernt deren Typ', async () => {
    const project = await createTempProject({
      'task.ts': 'export interface Task {}\n',
      'user.ts': 'export interface User {}\n',
    });

    await generateInterfaces(optionsFor(project));
    await backdate(project);
    await project.remove('task.ts');
    const second = await generateInterfaces(optionsFor(project));

    expect(second.skipped).toBeUndefined();
    expect(declaredTypes(await project.read())).toEqual(['User']);
  });

  it('generiert, wenn die Ausgabe fehlt, obwohl die Quellen alt sind', async () => {
    const project = await createTempProject({ 'user.ts': 'export interface User {}\n' });

    await generateInterfaces(optionsFor(project));
    await backdate(project);
    await fs.rm(project.outputFile);
    const second = await generateInterfaces(optionsFor(project));

    expect(second).toEqual({ files: 1, interfaces: 1 });
  });
});

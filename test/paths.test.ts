import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveOptions } from '../src/core/paths';

const ROOT = path.resolve('/projects/app');

describe('resolveOptions', () => {
  it('faellt auf die Laravel-typischen Standardpfade zurueck', () => {
    const opts = resolveOptions(ROOT);

    expect(opts.interfaceDir).toBe(path.resolve(ROOT, 'resources/js/interfaces'));
    expect(opts.outputFile).toBe(path.resolve(ROOT, 'resources/js/types/interfaces.d.ts'));
    expect(opts.excludeFiles).toEqual(new Set());
  });

  it('loest relative Optionen gegen root auf', () => {
    const opts = resolveOptions(ROOT, { dir: 'src/interfaces', out: 'src/types/generated.d.ts' });

    expect(opts.interfaceDir).toBe(path.resolve(ROOT, 'src/interfaces'));
    expect(opts.outputFile).toBe(path.resolve(ROOT, 'src/types/generated.d.ts'));
  });

  it('laesst absolute Optionen unveraendert', () => {
    const absoluteDir = path.resolve('/elsewhere/interfaces');
    const absoluteOut = path.resolve('/elsewhere/types/interfaces.d.ts');

    const opts = resolveOptions(ROOT, { dir: absoluteDir, out: absoluteOut });

    expect(opts.interfaceDir).toBe(absoluteDir);
    expect(opts.outputFile).toBe(absoluteOut);
  });

  it('normalisiert Pfade mit .. und doppelten Trennern', () => {
    const opts = resolveOptions(ROOT, { dir: 'src/../src/interfaces' });

    expect(opts.interfaceDir).toBe(path.resolve(ROOT, 'src/interfaces'));
  });

  it('macht aus exclude ein Set und entfernt Duplikate', () => {
    const opts = resolveOptions(ROOT, { exclude: ['base.ts', 'base.ts', 'legacy.ts'] });

    expect(opts.excludeFiles).toEqual(new Set(['base.ts', 'legacy.ts']));
  });

  it('behandelt ein leeres Options-Objekt wie gar keine Optionen', () => {
    expect(resolveOptions(ROOT, {})).toEqual(resolveOptions(ROOT));
  });
});

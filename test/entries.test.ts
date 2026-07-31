import { describe, expect, it } from 'vitest';

import astro from '../src/astro';
import esbuild from '../src/esbuild';
import farm from '../src/farm';
import unplugin, {
  esbuild as esbuildExport,
  rollup as rollupExport,
  unpluginFactory,
  vite as viteExport,
  webpack as webpackExport,
} from '../src/index';
import nuxt from '../src/nuxt';
import rollup from '../src/rollup';
import rspack from '../src/rspack';
import vite from '../src/vite';
import webpack from '../src/webpack';

// Die Adapter sind duenn, brechen aber geschlossen: ein falscher Pfad in einem
// der Einstiegspunkte faellt erst beim Konsumenten auf, weil package.json sie
// einzeln als exports-Eintraege veroeffentlicht.
describe('Einstiegspunkte', () => {
  it.each([
    ['astro', astro],
    ['esbuild', esbuild],
    ['farm', farm],
    ['nuxt', nuxt],
    ['rollup', rollup],
    ['rspack', rspack],
    ['vite', vite],
    ['webpack', webpack],
  ])('%s exportiert eine Plugin-Factory als default', (_name, entry) => {
    expect(typeof entry).toBe('function');
  });

  it('stellt ueber den Index alle Bundler-Varianten bereit', () => {
    expect(typeof unpluginFactory).toBe('function');

    for (const factory of [viteExport, rollupExport, webpackExport, esbuildExport]) {
      expect(typeof factory).toBe('function');
    }
  });

  // createUnplugin liefert die Bundler-Adapter ueber Getter -- jeder Zugriff
  // erzeugt eine neue Funktion. Vergleichbar ist daher nur die Form.
  it('exportiert die unplugin-Instanz als default', () => {
    for (const framework of ['vite', 'rollup', 'webpack', 'esbuild', 'rspack', 'farm'] as const) {
      expect(typeof unplugin[framework]).toBe('function');
    }
  });
});

describe('Astro-Integration', () => {
  it('haengt das Vite-Plugin in die Astro-Config', async () => {
    const integration = astro({ dir: 'src/interfaces' });
    const config = { vite: {} as { plugins?: unknown[] } };

    await integration.hooks['astro:config:setup']({ config });

    expect(config.vite.plugins).toHaveLength(1);
  });
});

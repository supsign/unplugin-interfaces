import path from 'node:path';

import { build as esbuildBuild } from 'esbuild';
import { rollup } from 'rollup';
import { build as viteBuild } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import webpack from 'webpack';

import EsbuildPlugin from '../src/esbuild';
import RollupPlugin from '../src/rollup';
import type { Options } from '../src/types';
import VitePlugin from '../src/vite';
import WebpackPlugin from '../src/webpack';
import type { TempProject } from './support/tempProject';
import { createTempProject } from './support/tempProject';

const PLUGIN_NAME = '@supsign/unplugin-interfaces';

const INTERFACES = {
  'base.ts': 'export interface Base {\n  id: string;\n}\n',
  'user.ts':
    "import type { Base } from './base';\n\ninterface User extends Base {\n  email: string;\n}\n\nexport { User };\n",
};

const EXPECTED_OUTPUT = [
  'declare global {',
  "  type Base = import('../interfaces/base').Base;",
  "  type User = import('../interfaces/user').User;",
  '}',
  '',
  'export {};',
  '',
].join('\n');

interface Scaffold {
  project: TempProject;
  entry: string;
  outDir: string;
  options: Options;
}

async function scaffold(): Promise<Scaffold> {
  const project = await createTempProject(INTERFACES);
  const entry = await project.writeAtRoot('src/main.mjs', "export const greeting = 'hi';\n");

  return {
    project,
    entry,
    outDir: path.join(project.root, 'out'),
    options: { dir: project.interfaceDir, out: project.outputFile },
  };
}

async function runRollup({ entry, options }: Scaffold): Promise<void> {
  const bundle = await rollup({
    input: entry,
    logLevel: 'silent',
    plugins: [RollupPlugin(options)],
  });
  await bundle.close();
}

async function runVite({ entry, outDir, options, project }: Scaffold): Promise<void> {
  await viteBuild({
    root: project.root,
    // Ohne configFile: false zieht Vite die vite.config.ts des Repos --
    // der Test wuerde dann etwas anderes bauen als er beschreibt.
    configFile: false,
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true, lib: { entry, formats: ['es'], fileName: 'bundle' } },
    plugins: [VitePlugin(options)],
  });
}

async function runWebpack({ entry, outDir, options }: Scaffold): Promise<void> {
  const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
    webpack(
      {
        mode: 'development',
        devtool: false,
        entry,
        output: { path: outDir, filename: 'bundle.js' },
        plugins: [WebpackPlugin(options)],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
  });

  if (stats?.hasErrors()) {
    throw new Error(stats.toString({ all: false, errors: true }));
  }
}

async function runEsbuild({ entry, outDir, options }: Scaffold): Promise<void> {
  await esbuildBuild({
    entryPoints: [entry],
    bundle: true,
    outfile: path.join(outDir, 'bundle.js'),
    logLevel: 'silent',
    plugins: [EsbuildPlugin(options)],
  });
}

/**
 * `usesContextLogger` unterscheidet die beiden Wege, auf denen die Meldung
 * herauskommt: Rollup und Vite reichen ihren eigenen PluginContext mit info()
 * durch, der von unplugin fuer webpack und esbuild gebaute Kontext hat keines.
 * Genau daran ist `this.info(...)` dort in ein TypeError gelaufen.
 */
const BUNDLERS = [
  { name: 'rollup', run: runRollup, usesContextLogger: true },
  { name: 'vite', run: runVite, usesContextLogger: true },
  { name: 'webpack', run: runWebpack, usesContextLogger: false },
  { name: 'esbuild', run: runEsbuild, usesContextLogger: false },
];

afterEach(() => vi.restoreAllMocks());

// Diese Tests laufen bewusst durch den echten Bundler statt gegen einen
// nachgebauten Kontext: der Absturz in buildStart lag nicht im Plugin-Code,
// sondern in dem, was der jeweilige Adapter als `this` hereingibt. Ein Mock
// haette ihn nie gezeigt.
describe('Bundler-Integration', () => {
  it.each(BUNDLERS)(
    'erzeugt die Deklarationen waehrend eines echten $name-Builds',
    async (bundler) => {
      const context = await scaffold();
      const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

      await bundler.run(context);

      expect(await context.project.read()).toBe(EXPECTED_OUTPUT);

      const fallbackCalls = consoleInfo.mock.calls.filter((call) =>
        String(call[0]).startsWith(PLUGIN_NAME)
      );

      if (bundler.usesContextLogger) {
        expect(fallbackCalls).toEqual([]);
      } else {
        expect(fallbackCalls).toEqual([[`${PLUGIN_NAME}: Generated 2 interfaces from 2 files`]]);
      }
    },
    120_000
  );

  it.each(BUNDLERS)(
    'bricht bei $name nicht ab, wenn nichts zu tun ist',
    async (bundler) => {
      const context = await scaffold();

      await bundler.run(context);
      await bundler.run(context);

      expect(await context.project.read()).toBe(EXPECTED_OUTPUT);
    },
    120_000
  );
});

import process from 'node:process';

import chokidar from 'chokidar';
import type { UnpluginFactory } from 'unplugin';
import { createUnplugin } from 'unplugin';

import type { GenerateResult } from './core/generator';
import { generateInterfaces } from './core/generator';
import { resolveOptions } from './core/paths';
import type { Options } from './types';

const PLUGIN_NAME = '@supsign/unplugin-interfaces';

interface MaybeLoggingContext {
  info?: (message: string) => void;
}

/**
 * `UnpluginBuildContext` garantiert kein `info()`. Rollup und Vite reichen
 * ihren eigenen PluginContext durch, der eines hat -- der von unplugin fuer
 * webpack, rspack, esbuild und farm gebaute Kontext nicht. Ein direkter
 * `this.info(...)`-Aufruf lief dort in ein `TypeError` und brach den Build
 * schon in `buildStart` ab.
 */
function report(context: unknown, message: string): void {
  const info = (context as MaybeLoggingContext | null | undefined)?.info;

  if (typeof info === 'function') {
    info.call(context, message);
    return;
  }

  // Ohne Kontext-Logger ist die Konsole die einzige Stelle, an der die
  // Meldung ueberhaupt ankommt.
  // oxlint-disable-next-line no-console
  console.info(`${PLUGIN_NAME}: ${message}`);
}

function describeResult(result: GenerateResult): string {
  return result.skipped
    ? `Interfaces already up to date (${result.files} files)`
    : `Generated ${result.interfaces} interfaces from ${result.files} files`;
}

export const unpluginFactory: UnpluginFactory<Options | undefined> = (userOptions = {}, meta) => {
  const root =
    meta.framework === 'vite'
      ? ((meta as any)?.vite?.server?.config?.root ?? process.cwd())
      : process.cwd();

  const opts = resolveOptions(root, userOptions);
  let isDevServer = false;

  return {
    name: PLUGIN_NAME,

    async buildStart() {
      if (isDevServer) {
        return;
      }
      report(this, describeResult(await generateInterfaces(opts)));
    },

    vite: {
      configureServer(server) {
        isDevServer = true;

        const log = (prefix: string): void => {
          generateInterfaces(opts).then((result) => {
            server.config.logger.info(`${prefix}${describeResult(result)}`, { timestamp: true });
          });
        };

        log(`${PLUGIN_NAME}: `);

        const watcher = chokidar.watch(opts.interfaceDir, {
          ignored: (filePath) =>
            filePath.endsWith('index.ts') ||
            filePath.endsWith('.d.ts') ||
            [...opts.excludeFiles].some((filename) => filePath.endsWith(filename)),
          ignoreInitial: true,
        });

        watcher
          .on('add', () => log('Added file, regenerated: '))
          .on('change', () => log('Updated file, regenerated: '))
          .on('unlink', () => log('Removed file, regenerated: '));

        server.watcher.on('close', () => watcher.close());
      },
    },
  };
};

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
export const vite = unplugin.vite;
export const rollup = unplugin.rollup;
export const webpack = unplugin.webpack;
export const esbuild = unplugin.esbuild;

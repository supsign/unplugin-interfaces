import process from 'node:process';

import chokidar from 'chokidar';
import type { UnpluginFactory } from 'unplugin';
import { createUnplugin } from 'unplugin';

import { generateInterfaces } from './core/generator';
import { resolveOptions } from './core/paths';
import type { Options } from './types';

export const unpluginFactory: UnpluginFactory<Options | undefined> = (userOptions = {}, meta) => {
  const root =
    meta.framework === 'vite'
      ? ((meta as any)?.vite?.server?.config?.root ?? process.cwd())
      : process.cwd();

  const opts = resolveOptions(root, userOptions);
  let isDevServer = false;

  return {
    name: '@supsign/unplugin-interfaces',

    async buildStart() {
      if (isDevServer) {
        return;
      }
      const result = await generateInterfaces(opts);
      this.info(`Generated ${result.interfaces} interfaces from ${result.files} files`);
    },

    vite: {
      configureServer(server) {
        isDevServer = true;

        generateInterfaces(opts).then((result) => {
          server.config.logger.info(
            `@supsign/unplugin-interfaces: Generated ${result.interfaces} interfaces from ${result.files} files`,
            { timestamp: true }
          );
        });

        const watcher = chokidar.watch(opts.interfaceDir, {
          ignored: (filePath) =>
            filePath.endsWith('index.ts') ||
            filePath.endsWith('.d.ts') ||
            [...opts.excludeFiles].some((filename) => filePath.endsWith(filename)),
          ignoreInitial: true,
        });

        const log = (action: string): void => {
          generateInterfaces(opts).then((result) => {
            server.config.logger.info(
              `${action}: ${result.interfaces} interfaces from ${result.files} files`,
              { timestamp: true }
            );
          });
        };

        watcher
          .on('add', () => log('Added file, regenerated'))
          .on('change', () => log('Updated file, regenerated'))
          .on('unlink', () => log('Removed file, regenerated'));

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

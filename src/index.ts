import type { UnpluginFactory } from 'unplugin'
import type { Options } from './types'
import chokidar from 'chokidar'
import { createUnplugin } from 'unplugin'
import { generateInterfaces } from './core/generator'
import { resolveOptions } from './core/paths'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (userOptions = {}, meta) => {
  const root
    = meta.framework === 'vite'
      ? (meta as any)?.vite?.server?.config?.root ?? process.cwd()
      : process.cwd()

  const opts = resolveOptions(root, userOptions)

  return {
    name: '@supsign/unplugin-interfaces',

    // 1) Einmal beim Build
    buildStart() {
      const result = generateInterfaces(opts)
      this.info(`Generated ${result.interfaces} interfaces from ${result.files} files`)
    },

    // 2) Vite-Dev-Server: Live-Watching
    vite: {
      configureServer(server) {
        const watcher = chokidar.watch(opts.interfaceDir, {
          ignored: filePath =>
            filePath.endsWith('index.ts')
            || filePath.endsWith('.d.ts')
            || [...opts.excludeFiles].some(f => filePath.endsWith(f)),
          ignoreInitial: true,
        })

        const log = (action: string) => {
          const result = generateInterfaces(opts)
          server.config.logger.info(
            `${action}: ${result.interfaces} interfaces from ${result.files} files`,
            { timestamp: true },
          )
        }

        watcher
          .on('add', () => log('Added file, regenerated'))
          .on('change', () => log('Updated file, regenerated'))
          .on('unlink', () => log('Removed file, regenerated'))

        server.watcher.on('close', () => watcher.close())
      },
    },

    transformInclude(id) {
      return id.endsWith('main.ts')
    },
    transform(code) {
      return code.replace('__UNPLUGIN__', 'Hello Unplugin!')
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

export default unplugin
export const vite = unplugin.vite
export const rollup = unplugin.rollup
export const webpack = unplugin.webpack
export const esbuild = unplugin.esbuild

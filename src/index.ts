import type { UnpluginFactory } from 'unplugin'
import type { Options } from './types'
import chokidar from 'chokidar'
import { createUnplugin } from 'unplugin'
import { generateInterfaces } from './core/generator'
import { resolveOptions } from './core/paths'

export const unpluginFactory: UnpluginFactory<Options | undefined> = (userOptions = {}, meta) => {
  // Projekt-Root bestimmen (Vite hat ggf. ein anderes Root)
  const root
    = meta.framework === 'vite'
      ? (meta as any)?.vite?.server?.config?.root ?? process.cwd()
      : process.cwd()

  const opts = resolveOptions(root, userOptions)
  const generate = () => generateInterfaces(opts)

  return {
    name: '@supsign/unplugin-interfaces',

    // 1) Einmal beim Build
    buildStart() {
      generate()
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

        watcher
          .on('add', generate)
          .on('change', generate)
          .on('unlink', generate)

        server.watcher.on('close', () => watcher.close())
      },
    },

    // Optional: Beispiel-Transform-Hooks als Platzhalter
    transformInclude(id) {
      return id.endsWith('main.ts')
    },
    transform(code) {
      return code.replace('__UNPLUGIN__', 'Hello Unplugin!')
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)

// Multi-Bundler Exporte
export default unplugin
export const vite = unplugin.vite
export const rollup = unplugin.rollup
export const webpack = unplugin.webpack
export const esbuild = unplugin.esbuild

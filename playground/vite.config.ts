import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import Unplugin from '../src/vite'

export default defineConfig({
  plugins: [
    Inspect(),
    Unplugin({
      dir: 'src/interfaces',
      out: 'src/types/interfaces.d.ts',
      exclude: ['base.ts'],
    }),
  ],
})

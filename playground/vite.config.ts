import { defineConfig } from 'vite'
import Unplugin from '../src/vite'

export default defineConfig({
  plugins: [
    Unplugin({
      dir: 'src/interfaces',
      out: 'src/types/interfaces.d.ts',
    }),
  ],
})

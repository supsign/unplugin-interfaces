import type { ResolvedOptions } from '../types'
import fs from 'node:fs'
import path from 'node:path'

export function generateInterfaces(opts: ResolvedOptions): void {
  const { interfaceDir, indexFile, outputFile, excludeFiles } = opts

  const files = fs.readdirSync(interfaceDir)
    .filter(file => file.endsWith('.ts') && file !== 'index.ts' && !excludeFiles.has(file))

  const interfaces: { file: string, names: string[] }[] = []

  for (const file of files) {
    const filePath = path.join(interfaceDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const matches = [...content.matchAll(/export\s+interface\s+(\w+)/g)]
    const names = matches.map(m => m[1])
    if (names.length)
      interfaces.push({ file, names })
  }

  // index.ts
  const exportLines = interfaces.map(i => `export * from './${path.basename(i.file, '.ts')}';`)
  fs.writeFileSync(indexFile, exportLines.join('\n'), 'utf-8')

  // interfaces.d.ts
  const globalLines = [
    `import type * as Interfaces from '../interfaces';`,
    '',
    'declare global {',
    ...interfaces.flatMap(i => i.names.map(name => `  export interface ${name} extends Interfaces.${name} {}`)),
    '}',
    '',
    'export {};',
  ]
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, globalLines.join('\n'), 'utf-8')
}

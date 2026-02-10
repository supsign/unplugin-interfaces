import type { ResolvedOptions } from '../types'
import fs from 'node:fs'
import path from 'node:path'

export interface GenerateResult {
  files: number
  interfaces: number
}

export function generateInterfaces(opts: ResolvedOptions): GenerateResult {
  const { interfaceDir, indexFile, outputFile, excludeFiles } = opts

  const files = fs.readdirSync(interfaceDir)
    .filter(file => file.endsWith('.ts') && file !== 'index.ts' && !excludeFiles.has(file))

  const interfaces: { file: string, names: string[] }[] = []

  for (const file of files) {
    const filePath = path.join(interfaceDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    // Find exported interfaces: export interface Name
    const interfaceMatches = [...content.matchAll(/export\s+interface\s+(\w+)/g)]
    const interfaceNames = interfaceMatches.map(m => m[1])

    // Find named exports: export { Name1, Name2 }
    const namedExportMatches = [...content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g)]
    const namedExportNames = namedExportMatches.flatMap(m =>
      m[1].split(',').map(item => item.trim().split(/\s+as\s+/)[0].trim()),
    )

    const names = [...interfaceNames, ...namedExportNames]
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

  return {
    files: files.length,
    interfaces: interfaces.flatMap(i => i.names).length,
  }
}

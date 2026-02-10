import type { ResolvedOptions } from '../types'
import fs from 'node:fs'
import path from 'node:path'

export interface GenerateResult {
  files: number
  interfaces: number
}

export function generateInterfaces(opts: ResolvedOptions): GenerateResult {
  const { interfaceDir, outputFile, excludeFiles } = opts

  const files = fs.readdirSync(interfaceDir)
    .filter(file => file.endsWith('.ts') && file !== 'index.ts' && !excludeFiles.has(file))

  const interfaces: { file: string, names: string[] }[] = []

  for (const file of files) {
    const filePath = path.join(interfaceDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    // Find exported interfaces: export interface Name (single line only)
    const interfaceMatches = [...content.matchAll(/^export\s+interface\s+([A-Za-z_$][\w$]*)/gm)]
    const interfaceNames = interfaceMatches.map(m => m[1])

    // Find named exports: export { Name1, Name2 } (but not export type { })
    const namedExportMatches = [...content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g)]
    const namedExportNames = namedExportMatches
      .filter(m => !content.substring(Math.max(0, m.index! - 10), m.index!).includes('type'))
      .flatMap(m =>
        m[1].split(',').map(item => item.trim().split(/\s+as\s+/)[0].trim()).filter(name => name.length > 0),
      )

    // Find typed exports: export type { Name1, Name2 }
    const typeExportMatches = [...content.matchAll(/export\s+type\s*\{\s*([^}]+)\s*\}/g)]
    const typeExportNames = typeExportMatches.flatMap(m =>
      m[1].split(',').map(item => item.trim().split(/\s+as\s+/)[0].trim()).filter(name => name.length > 0),
    )

    // Remove duplicates and filter out empty names
    const allNames = [...interfaceNames, ...namedExportNames, ...typeExportNames]
    const names = [...new Set(allNames)].filter(name => name && name !== 'export')

    if (names.length)
      interfaces.push({ file, names })
  }

  // interfaces.d.ts - clean global types with inline imports
  const globalLines = [
    'declare global {',
    ...interfaces.flatMap(i => i.names.map(name =>
      `  type ${name} = import('../interfaces/${path.basename(i.file, '.ts')}').${name};`,
    )),
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

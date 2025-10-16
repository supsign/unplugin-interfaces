export interface Options {
  /** Verzeichnis mit deinen Interface-Dateien */
  dir?: string
  /** Dateien (Dateinamen) ausschliessen */
  exclude?: string[]
  /** Pfad zur generierten globalen d.ts-Datei */
  out?: string
}

export interface ResolvedOptions {
  interfaceDir: string
  indexFile: string
  outputFile: string
  excludeFiles: Set<string>
}

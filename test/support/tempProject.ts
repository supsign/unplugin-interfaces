import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach } from 'vitest';

const MINUTE_MS = 60_000;

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true }))
  );
});

export interface TempProject {
  /** Wurzel des Wegwerf-Projekts. */
  root: string;
  /** Verzeichnis, das der Generator einliest. */
  interfaceDir: string;
  /** Zieldatei der generierten globalen Deklarationen. */
  outputFile: string;
  /** Legt eine Datei in interfaceDir an (Unterordner werden erstellt). */
  write: (fileName: string, content: string) => Promise<void>;
  /** Loescht eine Datei aus interfaceDir. */
  remove: (fileName: string) => Promise<void>;
  /** Liest die generierte Ausgabedatei. */
  read: () => Promise<string>;
}

export async function createTempProject(files: Record<string, string> = {}): Promise<TempProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unplugin-interfaces-'));
  createdDirs.push(root);

  const interfaceDir = path.join(root, 'interfaces');
  const outputFile = path.join(root, 'types', 'interfaces.d.ts');
  await fs.mkdir(interfaceDir, { recursive: true });

  const write = async (fileName: string, content: string): Promise<void> => {
    const target = path.join(interfaceDir, fileName);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  };

  await Promise.all(Object.entries(files).map(([fileName, content]) => write(fileName, content)));

  return {
    root,
    interfaceDir,
    outputFile,
    write,
    remove: (fileName) => fs.rm(path.join(interfaceDir, fileName)),
    read: () => fs.readFile(outputFile, 'utf8'),
  };
}

/**
 * Datiert Quellen, Verzeichnis und Ausgabe so zurueck, dass der mtime-Cache
 * eindeutig greift: Ausgabe eine Minute alt, Quellen zwei.
 *
 * Ohne das Zurueckdatieren haengen die Cache-Tests an der Uhraufloesung des
 * Dateisystems -- Schreiben und Pruefen faenden in derselben Millisekunde
 * statt und das Ergebnis waere Zufall. Eine anschliessende echte Aenderung
 * setzt die mtime auf "jetzt" und liegt damit sicher hinter der Ausgabe.
 */
export async function backdate(project: TempProject): Promise<void> {
  const outputTime = new Date(Date.now() - MINUTE_MS);
  const sourceTime = new Date(Date.now() - 2 * MINUTE_MS);

  const entries = await fs.readdir(project.interfaceDir);
  await Promise.all(
    entries.map((entry) =>
      fs.utimes(path.join(project.interfaceDir, entry), sourceTime, sourceTime)
    )
  );

  // Erst nach den Dateien: jedes utimes auf eine Datei laesst die mtime des
  // Verzeichnisses unberuehrt, aber die Reihenfolge macht die Absicht klar.
  await fs.utimes(project.interfaceDir, sourceTime, sourceTime);
  await fs.utimes(project.outputFile, outputTime, outputTime);
}

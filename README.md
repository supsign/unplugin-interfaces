# @supsign/unplugin-interfaces

Erzeugt aus einem Verzeichnis mit Interface-Dateien eine globale
Deklarationsdatei (`interfaces.d.ts`), damit die Typen ohne Import ueberall
verfuegbar sind.

Gebaut mit [unplugin](https://github.com/unjs/unplugin) und damit nutzbar in
Vite, Rollup, webpack, Rspack, esbuild, Farm, Astro und Nuxt.

## Installation

```bash
pnpm add -D @supsign/unplugin-interfaces
```

## Verwendung

```ts
// vite.config.ts
import Interfaces from '@supsign/unplugin-interfaces/vite';

export default defineConfig({
  plugins: [
    Interfaces({ dir: 'resources/js/interfaces', out: 'resources/js/types/interfaces.d.ts' }),
  ],
});
```

Fuer andere Bundler denselben Import mit dem passenden Suffix verwenden:
`/rollup`, `/webpack`, `/rspack`, `/esbuild`, `/farm`, `/astro`, `/nuxt`.

## Optionen

| Option    | Typ        | Default                              | Bedeutung                                   |
| --------- | ---------- | ------------------------------------ | ------------------------------------------- |
| `dir`     | `string`   | `resources/js/interfaces`            | Verzeichnis mit den Interface-Dateien       |
| `out`     | `string`   | `resources/js/types/interfaces.d.ts` | Zieldatei der generierten Deklarationen     |
| `exclude` | `string[]` | `[]`                                 | Dateinamen, die uebersprungen werden sollen |

Relative Pfade werden gegen die Projektwurzel aufgeloest, absolute unveraendert
uebernommen.

## Was erkannt wird

Gelesen werden alle `.ts`-Dateien im konfigurierten Verzeichnis; `index.ts`,
`.d.ts`-Dateien und alles aus `exclude` bleiben aussen vor.

```ts
export interface User {} // -> User
interface Profile {}
export { Profile }; // -> Profile
export type { Contact }; // -> Contact
export { Internal as Account }; // -> Account (der exportierte Name zaehlt)
export { type License }; // -> License
```

Daraus entsteht:

```ts
declare global {
  type User = import('../interfaces/user').User;
}

export {};
```

Die Erkennung arbeitet mit regulaeren Ausdruecken, nicht mit dem TypeScript-AST.
Zwei Grenzen ergeben sich daraus:

- Eingerueckte Deklarationen (z. B. innerhalb eines `namespace`) werden nicht
  erfasst -- `export interface` muss am Zeilenanfang stehen.
- `export { foo }` wird uebernommen, auch wenn `foo` ein Wert und kein Typ ist.

Taucht ein Name mehrfach auf -- in derselben oder in mehreren Dateien --, wird er
nur einmal deklariert; die alphabetisch erste Datei gewinnt. `export { X as
default }` wird ausgelassen, weil `type default` kein gueltiger TypeScript-Code
waere.

## Regenerierung

Ausserhalb des Dev-Servers laeuft die Generierung einmal in `buildStart`. Ein
Lauf wird uebersprungen, solange weder eine Quelldatei noch das Verzeichnis
selbst neuer ist als die Ausgabedatei -- das Verzeichnis zaehlt mit, damit auch
das Anlegen und Loeschen einer Datei erkannt wird.

Im Vite-Dev-Server uebernimmt ein Watcher: neue, geaenderte und geloeschte
Dateien loesen jeweils eine Neugenerierung aus.

## Entwicklung

```bash
pnpm install
pnpm run build        # dist/ bauen
pnpm run test         # Tests
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # oxlint
pnpm run format       # oxfmt
pnpm run verify:dist  # gebautes Paket pruefen (braucht ein vorheriges build)
pnpm run play         # Playground mit Vite-Dev-Server
```

Die Testsuite hat drei Ebenen:

- **Unit** (`test/generator.test.ts`, `test/paths.test.ts`) -- Erkennung, Dateiauswahl,
  Ausgabeformat und mtime-Cache gegen Wegwerf-Verzeichnisse.
- **Integration** (`test/integration.test.ts`) -- ein echter Build mit Rollup, Vite,
  webpack und esbuild. Die Adapter reichen unterschiedliche Plugin-Kontexte herein;
  Fehler darin sind gegen einen nachgebauten Kontext nicht sichtbar.
- **Paket** (`test/package.test.ts`, `scripts/verifyDist.mjs`) -- die exports-Map gegen
  `src/` und gegen das gebaute `dist/`. Was zwischen Quelle und Auslieferung
  verrutscht, faellt sonst erst beim Konsumenten auf.

## Lizenz

[MIT](./LICENSE)

import fs from 'node:fs/promises';
import path from 'node:path';

import type { UnpluginContextMeta, UnpluginOptions } from 'unplugin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Options } from '../src/types';
import type { TempProject } from './support/tempProject';
import { backdate, createTempProject } from './support/tempProject';

const PLUGIN_NAME = '@supsign/unplugin-interfaces';

// chokidar wird ersetzt, statt echte Dateisystem-Events abzuwarten: getestet
// werden soll die Verdrahtung (ignore-Regel, Handler, Aufraeumen), nicht
// chokidar selbst. Echte Events waeren zeitabhaengig und damit flaky.
const chokidarMock = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  const watchCalls: { dir: string; ignored: (filePath: string) => boolean }[] = [];
  const close = vi.fn(() => Promise.resolve());

  const watcher = {
    close,
    on(event: string, handler: () => void) {
      handlers.set(event, handler);
      return watcher;
    },
  };

  return {
    close,
    handlers,
    watchCalls,
    reset(): void {
      handlers.clear();
      watchCalls.length = 0;
      close.mockClear();
    },
    watch(dir: string, options: { ignored: (filePath: string) => boolean }) {
      watchCalls.push({ dir, ignored: options.ignored });
      return watcher;
    },
  };
});

vi.mock('chokidar', () => ({ default: { watch: chokidarMock.watch } }));

const { unpluginFactory } = await import('../src/index');

function metaFor(framework: 'rollup' | 'vite'): UnpluginContextMeta {
  return { framework, versions: {} };
}

function pluginFor(project: TempProject, extra: Options = {}): UnpluginOptions {
  const plugin = unpluginFactory(
    { dir: project.interfaceDir, out: project.outputFile, ...extra },
    metaFor('rollup')
  );

  // UnpluginFactory erlaubt typseitig auch mehrere Plugins -- diese Factory
  // liefert genau eines.
  if (Array.isArray(plugin)) {
    throw new TypeError('Erwartet wird ein einzelnes Plugin, kein Array');
  }

  return plugin;
}

async function runBuildStart(plugin: UnpluginOptions, context: unknown = {}): Promise<void> {
  const hook = plugin.buildStart;

  if (typeof hook !== 'function') {
    throw new TypeError('buildStart-Hook fehlt');
  }

  await (hook as (this: unknown) => Promise<void>).call(context);
}

interface FakeServer {
  config: { logger: { info: ReturnType<typeof vi.fn> } };
  watcher: { on: (event: string, handler: () => void) => void };
  closeServerWatcher: () => void;
}

function createFakeServer(): FakeServer {
  const closeHandlers: (() => void)[] = [];

  return {
    closeServerWatcher: () => {
      for (const handler of closeHandlers) {
        handler();
      }
    },
    config: { logger: { info: vi.fn() } },
    watcher: {
      on(event: string, handler: () => void) {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      },
    },
  };
}

async function runConfigureServer(plugin: UnpluginOptions, server: FakeServer): Promise<void> {
  const hook = plugin.vite?.configureServer;

  if (typeof hook !== 'function') {
    throw new TypeError('configureServer-Hook fehlt');
  }

  await (hook as (this: unknown, server: unknown) => unknown).call({}, server);
  await vi.waitFor(() => expect(server.config.logger.info).toHaveBeenCalled());
}

const SINGLE_INTERFACE = { 'user.ts': 'export interface User {}\n' };

beforeEach(() => chokidarMock.reset());
afterEach(() => vi.restoreAllMocks());

describe('unpluginFactory', () => {
  it('meldet sich unter dem Paketnamen an', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);

    expect(pluginFor(project).name).toBe(PLUGIN_NAME);
  });

  it('reicht Optionen an den Generator durch', async () => {
    const project = await createTempProject({
      'legacy.ts': 'export interface Legacy {}\n',
      ...SINGLE_INTERFACE,
    });

    await runBuildStart(pluginFor(project, { exclude: ['legacy.ts'] }));

    expect(await project.read()).not.toContain('Legacy');
  });
});

describe('buildStart', () => {
  it('generiert die Deklarationen und meldet ueber this.info', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const info = vi.fn();

    await runBuildStart(pluginFor(project), { info });

    expect(await project.read()).toContain("type User = import('../interfaces/user').User;");
    expect(info).toHaveBeenCalledWith('Generated 1 interfaces from 1 files');
  });

  // Regression: nur Rollup und Vite reichen einen PluginContext mit info()
  // durch. Der Kontext, den unplugin fuer webpack, rspack, esbuild und farm
  // baut, hat keines -- `this.info(...)` warf dort ein TypeError und liess
  // den Build in buildStart scheitern.
  it('faellt auf console.info zurueck, wenn der Kontext kein info hat', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(runBuildStart(pluginFor(project), {})).resolves.toBeUndefined();

    expect(consoleInfo).toHaveBeenCalledWith(`${PLUGIN_NAME}: Generated 1 interfaces from 1 files`);
  });

  it('meldet einen uebersprungenen Lauf als "already up to date"', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const info = vi.fn();
    const plugin = pluginFor(project);

    await runBuildStart(plugin, { info });
    await backdate(project);
    await runBuildStart(plugin, { info });

    expect(info).toHaveBeenLastCalledWith('Interfaces already up to date (1 files)');
  });
});

describe('vite configureServer', () => {
  it('generiert beim Serverstart und loggt ueber den Vite-Logger', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const server = createFakeServer();

    await runConfigureServer(pluginFor(project), server);

    expect(await project.read()).toContain('type User');
    expect(server.config.logger.info).toHaveBeenCalledWith(
      `${PLUGIN_NAME}: Generated 1 interfaces from 1 files`,
      { timestamp: true }
    );
  });

  it('beobachtet das Interface-Verzeichnis', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);

    await runConfigureServer(pluginFor(project), createFakeServer());

    expect(chokidarMock.watchCalls).toHaveLength(1);
    expect(chokidarMock.watchCalls[0].dir).toBe(project.interfaceDir);
  });

  it('ignoriert index.ts, .d.ts und ausgeschlossene Dateien', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);

    await runConfigureServer(pluginFor(project, { exclude: ['legacy.ts'] }), createFakeServer());
    const { ignored } = chokidarMock.watchCalls[0];

    expect(ignored(path.join(project.interfaceDir, 'index.ts'))).toBe(true);
    expect(ignored(path.join(project.interfaceDir, 'globals.d.ts'))).toBe(true);
    expect(ignored(path.join(project.interfaceDir, 'legacy.ts'))).toBe(true);
    expect(ignored(path.join(project.interfaceDir, 'user.ts'))).toBe(false);
  });

  it.each([
    ['add', 'Added file, regenerated: '],
    ['change', 'Updated file, regenerated: '],
    ['unlink', 'Removed file, regenerated: '],
  ])('generiert bei "%s" neu und loggt mit passendem Prefix', async (event, prefix) => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const server = createFakeServer();
    await runConfigureServer(pluginFor(project), server);

    await backdate(project);
    await project.write('task.ts', 'export interface Task {}\n');
    server.config.logger.info.mockClear();
    chokidarMock.handlers.get(event)?.();

    await vi.waitFor(() =>
      expect(server.config.logger.info).toHaveBeenCalledWith(
        `${prefix}Generated 2 interfaces from 2 files`,
        { timestamp: true }
      )
    );
  });

  it('schliesst den Watcher, wenn der Vite-Watcher schliesst', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const server = createFakeServer();

    await runConfigureServer(pluginFor(project), server);
    server.closeServerWatcher();

    expect(chokidarMock.close).toHaveBeenCalledOnce();
  });

  // Sonst liefe die Generierung im Dev-Server doppelt: einmal aus
  // configureServer, einmal aus buildStart derselben Instanz.
  it('macht buildStart nach einem Serverstart zum No-op', async () => {
    const project = await createTempProject(SINGLE_INTERFACE);
    const plugin = pluginFor(project);

    await runConfigureServer(plugin, createFakeServer());
    await fs.rm(project.outputFile);
    await runBuildStart(plugin, { info: vi.fn() });

    await expect(fs.access(project.outputFile)).rejects.toThrow();
  });
});

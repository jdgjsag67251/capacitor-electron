import type { CapacitorConfig } from '@capacitor/cli';
import chalk from 'chalk';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { Ora } from 'ora';
import ora from 'ora';
import { dirname, join, parse, resolve } from 'path';

enum PluginType {
  Core = 0,
  Cordova = 1,
  Incompatible = 2,
}
interface PluginManifest {
  electron: {
    src: string;
  };
  ios: {
    src: string;
    doctor?: any[];
  };
  android: {
    src: string;
  };
}
export interface Plugin {
  id: string;
  name: string;
  version: string;
  rootPath: string;
  manifest?: PluginManifest;
  repository?: any;
  xml?: any;
  ios?: {
    name: string;
    type: PluginType;
    path: string;
  };
  android?: {
    type: PluginType;
    path: string;
  };
}

type DeepReadonly<T> = { readonly [P in keyof T]: DeepReadonly<T[P]> };

export type ExternalConfig = DeepReadonly<CapacitorConfig>;
interface Config {
  readonly app: AppConfig;
}
interface AppConfig {
  readonly rootDir: string;
  readonly appId: string;
  readonly appName: string;
  readonly webDir: string;
  readonly webDirAbs: string;
  readonly package: PackageJson;
  readonly extConfigType: 'json' | 'js' | 'ts';
  readonly extConfigName: string;
  readonly extConfigFilePath: string;
  readonly extConfig: ExternalConfig;
  /**
   * Whether to use a bundled web runtime instead of relying on a bundler/module
   * loader. If you're not using something like rollup or webpack or dynamic ES
   * module imports, set this to "true" and import "capacitor.js" manually.
   */
  readonly bundledWebRuntime: boolean;
}
interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: { readonly [key: string]: string | undefined };
  readonly devDependencies?: { readonly [key: string]: string | undefined };
}

export async function getPlugins(packageJsonPath: string): Promise<(Plugin | null)[]> {
  const packageJson: PackageJson = (await readJSON(packageJsonPath)) as PackageJson;
  //console.log(packageJson);
  const possiblePlugins = getDependencies(packageJson);
  //console.log(possiblePlugins);
  const resolvedPlugins = await Promise.all(possiblePlugins.map(async (p) => resolvePlugin(p)));

  return resolvedPlugins.filter((p) => !!p);
}

export function getDependencies(packageJson: PackageJson): string[] {
  return [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})];
}

export async function resolvePlugin(name: string): Promise<Plugin | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const usersProjectDir = process.env.CAPACITOR_ROOT_DIR!;
    const packagePath = resolveNode(usersProjectDir, name, 'package.json');
    if (!packagePath) {
      console.error(
        `\nUnable to find ${chalk.bold(`node_modules/${name}`)}.\n` + `Are you sure ${chalk.bold(name)} is installed?`
      );
      return null;
    }

    const rootPath = dirname(packagePath);
    const meta = await readJSON(packagePath);
    if (!meta) {
      return null;
    }
    if (meta.capacitor) {
      return {
        id: name,
        name: fixName(name),
        version: meta.version,
        rootPath,
        repository: meta.repository,
        manifest: meta.capacitor,
      };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function resolveNode(root: string, ...pathSegments: string[]): string | null {
  try {
    const t = require.resolve(pathSegments.join('/'), { paths: [root] });
    //console.log(t);
    return t;
  } catch (e) {
    return null;
  }
}

export function errorLog(message: string): void {
  console.log(chalk.red(`Error: ${message}`));
}

export function getCwd(): string | undefined {
  const _cwd = process.env.INIT_CWD;
  return _cwd;
}

export function readJSON(pathToUse: string): { [key: string]: any } {
  const data = readFileSync(pathToUse, 'utf8');
  return JSON.parse(data);
}

export function runExec(command: string, { withOutput = false }: { withOutput?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(stdout + stderr);
      } else {
        resolve(stdout);
      }
    });

    if (withOutput) {
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
    }
  });
}

export function fixName(name: string): string {
  name = name
    .replace(/\//g, '_')
    .replace(/-/g, '_')
    .replace(/@/g, '')
    .replace(/_\w/g, (m) => m[1].toUpperCase());

  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function hashJsFileName(filename: string, slt: number): string {
  const hash = createHash('md5').update(`${Date.now()}-${slt}-${filename}`).digest('hex');
  return `${filename}-${hash}.js`;
}

export function writePrettyJSON(path: string, data: any): void {
  return writeFileSync(path, JSON.stringify(data, null, '  ') + '\n');
}

export function resolveNodeFrom(start: string, id: string): string | null {
  const rootPath = parse(start).root;
  let basePath = resolve(start);
  let modulePath;
  while (true) {
    modulePath = join(basePath, 'node_modules', id);
    if (existsSync(modulePath)) {
      return modulePath;
    }
    if (basePath === rootPath) {
      return null;
    }
    basePath = dirname(basePath);
  }
}

export function resolveElectronPlugin(plugin: Plugin): string | null {
  if (plugin.manifest?.electron?.src) {
    return join(plugin.rootPath, plugin.manifest.electron.src, 'dist/plugin.js');
  } else {
    return null;
  }
}

export type TaskInfoProvider = (message: string) => void;
export type TaskInfoContext = { spinner: Ora };

export async function runTask<T>(
  title: string,
  fn: (info: TaskInfoProvider, context: TaskInfoContext) => Promise<T>
): Promise<T> {
  let spinner: Ora = ora(title).start(`${title}`);
  try {
    spinner = spinner.start(`${title}: ${chalk.dim('start 🚀')}`);
    const start = process.hrtime();
    const value = await fn(
      (message: string) => {
        spinner = spinner.info();
        spinner = spinner.start(`${title}: ${chalk.dim(message)}`);
      },
      { spinner }
    );
    spinner = spinner.info();
    const elapsed = process.hrtime(start);
    spinner = spinner.succeed(`${title}: ${chalk.dim('completed in ' + formatHrTime(elapsed))}`);
    return value;
  } catch (e) {
    spinner = spinner.fail(`${title}: ${e.message ? e.message : ''}`);
    spinner = spinner.stop();
    throw e;
  }
}

const TIME_UNITS = ['s', 'ms', 'μp'];

function formatHrTime(hrtime: any) {
  let time = hrtime[0] + hrtime[1] / 1e9;
  let index = 0;
  for (; index < TIME_UNITS.length - 1; index++, time *= 1000) {
    if (time >= 1) {
      break;
    }
  }
  return time.toFixed(2) + TIME_UNITS[index];
}

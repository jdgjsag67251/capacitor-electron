import { app, ipcMain } from 'electron';
import mimeTypes from 'mime-types';
import { AsyncLocalStorage } from 'node:async_hooks';
import EventEmitter from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CallContext, CapacitorElectronConfig } from './definitions';

class CapElectronEmitter extends EventEmitter {}
let config: CapacitorElectronConfig = {};

export const CapElectronEventEmitter = new CapElectronEmitter();

export function deepMerge(target: any, _objects: any[] = []): any {
  // Credit for original function: Josh Cole(saikojosh)[https://github.com/saikojosh]
  const quickCloneArray = function (input: any) {
    return input.map(cloneValue);
  };
  const cloneValue = function (value: any) {
    if (getTypeOf(value) === 'object') return quickCloneObject(value);
    else if (getTypeOf(value) === 'array') return quickCloneArray(value);
    return value;
  };
  const getTypeOf = function (input: any) {
    if (input === null) return 'null';
    else if (typeof input === 'undefined') return 'undefined';
    else if (typeof input === 'object') return Array.isArray(input) ? 'array' : 'object';
    return typeof input;
  };
  const quickCloneObject = function (input: any) {
    const output: any = {};
    for (const key in input) {
      // eslint-disable-next-line no-prototype-builtins
      if (!input.hasOwnProperty(key)) {
        continue;
      }
      output[key] = cloneValue(input[key]);
    }
    return output;
  };
  const objects = _objects.map((object) => object || {});
  const output = target || {};
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let oindex = 0; oindex < objects.length; oindex++) {
    const object = objects[oindex];
    const keys = Object.keys(object);
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let kindex = 0; kindex < keys.length; kindex++) {
      const key = keys[kindex];
      const value = object[key];
      const type = getTypeOf(value);
      const existingValueType = getTypeOf(output[key]);
      if (type === 'object') {
        if (existingValueType !== 'undefined') {
          const existingValue = existingValueType === 'object' ? output[key] : {};
          output[key] = deepMerge({}, [existingValue, quickCloneObject(value)]);
        } else {
          output[key] = quickCloneObject(value);
        }
      } else if (type === 'array') {
        if (existingValueType === 'array') {
          const newValue = quickCloneArray(value);
          output[key] = newValue;
        } else {
          output[key] = quickCloneArray(value);
        }
      } else {
        output[key] = value;
      }
    }
  }
  return output;
}

export function pick<T>(object: Record<string, T>, keys: string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(object).filter(([key]) => keys.includes(key)));
}

export function deepClone<T>(object: Record<string, T>): Record<string, T> {
  if (globalThis?.structuredClone) {
    return globalThis.structuredClone(object);
  }

  return JSON.parse(JSON.stringify(object));
}

const pluginInstanceRegistry: { [pluginClassName: string]: { [functionName: string]: any } } = {};
const activeEventRegistry = new Map<string, () => void>();

export function setupCapacitorElectronPlugins(): void {
  const callerStorage = new AsyncLocalStorage();
  const caller = Object.defineProperties(
    {},
    {
      get: { value: () => callerStorage.getStore(), writable: false, configurable: false, enumerable: true },
    }
  );

  console.log('in setupCapacitorElectronPlugins');
  const rtPluginsPath = join(app.getAppPath(), 'build', 'src', 'rt', 'electron-plugins.js');
  const plugins: {
    [pluginName: string]: { [className: string]: any };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require(rtPluginsPath);

  console.log(plugins);
  for (const pluginKey of Object.keys(plugins)) {
    console.log(`${pluginKey}`);
    for (const classKey of Object.keys(plugins[pluginKey]).filter((className) => className !== 'default')) {
      console.log(`-> ${classKey}`);

      if (!pluginInstanceRegistry[classKey]) {
        pluginInstanceRegistry[classKey] = new plugins[pluginKey][classKey](
          deepClone(config as Record<string, unknown>),
          {
            caller,
          }
        );
      }

      const functionList = Object.getOwnPropertyNames(plugins[pluginKey][classKey].prototype).filter(
        (v) => v !== 'constructor'
      );

      for (const functionName of functionList) {
        console.log(`--> ${functionName}`);

        ipcMain.handle(`${classKey}-${functionName}`, (event, ...args) => {
          console.log(`called ipcMain.handle: ${classKey}-${functionName}`);
          const pluginRef = pluginInstanceRegistry[classKey];
          const callContext: CallContext = {
            senderFrame: event.senderFrame,
            processId: event.processId,
            frameId: event.frameId,
            sender: event.sender,
            event,
          };

          return callerStorage.run(callContext, () => pluginRef[functionName](...args));
        });
      }

      // For every Plugin which extends EventEmitter, start listening for 'event-add-{classKey}'
      {
        const registryInstance = pluginInstanceRegistry[classKey];

        if (registryInstance instanceof EventEmitter) {
          ipcMain.on(`event-add-${classKey}`, (event, type) => {
            const eventKey = `event-${classKey}-${type}`;

            if (activeEventRegistry.has(eventKey)) {
              return;
            }

            const eventHandler = (...data: unknown[]) => event.sender.send(eventKey, ...data);

            registryInstance.addListener(type, eventHandler);
            activeEventRegistry.set(eventKey, eventHandler);
          });
          ipcMain.on(`event-remove-${classKey}`, (event, type) => {
            const eventKey = `event-${classKey}-${type}`;
            const eventHandler = activeEventRegistry.get(eventKey);

            if (!eventHandler) {
              return;
            }

            registryInstance.removeListener(type, eventHandler);
            activeEventRegistry.delete(eventKey);
          });
        }
      }
    }
  }
}

export async function encodeFromFile(filePath: string): Promise<string> {
  if (!filePath) {
    throw new Error('filePath is required.');
  }

  let mediaType: string | boolean = mimeTypes.lookup(filePath);

  if (mediaType === false) {
    throw new Error('Media type unrecognized.');
  }

  if (typeof mediaType !== 'string') {
    throw new Error('Media type is not string.');
  }

  const fileData = readFileSync(filePath);

  mediaType = /\//.test(mediaType) ? mediaType : `image/${mediaType}`;

  const dataBase64 = Buffer.isBuffer(fileData) ? fileData.toString('base64') : Buffer.from(fileData).toString('base64');

  return `data:${mediaType};base64,${dataBase64}`;
}

export function getCapacitorElectronConfig(): CapacitorElectronConfig {
  let capFileConfig: Record<string, unknown> = {};

  if (existsSync(join(app.getAppPath(), 'build', 'capacitor.config.js'))) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    capFileConfig = require(join(app.getAppPath(), 'build', 'capacitor.config.js')).default;
  } else {
    capFileConfig = JSON.parse(readFileSync(join(app.getAppPath(), 'capacitor.config.json')).toString());
  }

  if (capFileConfig.electron) {
    config = deepMerge(config, [capFileConfig]);
  }

  return deepClone(config as Record<string, unknown>) as CapacitorElectronConfig;
}

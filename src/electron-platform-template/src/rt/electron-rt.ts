import { contextBridge, ipcRenderer } from 'electron';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugins = require('./electron-plugins');

const randomId = (length = 5) => randomBytes(length).toString('hex');

const contextApi: {
  [plugin: string]: { [functionName: string]: () => Promise<any> };
} = {};

for (const pluginKey of Object.keys(plugins)) {
  for (const classKey of Object.keys(plugins[pluginKey])) {
    if (classKey === 'default') {
      continue;
    }

    const functionList = Object.getOwnPropertyNames(plugins[pluginKey][classKey].prototype).filter(
      (v) => v !== 'constructor'
    );

    if (!contextApi[classKey]) {
      contextApi[classKey] = {};
    }

    for (const functionName of functionList) {
      if (!contextApi[classKey][functionName]) {
        contextApi[classKey][functionName] = (...args) => ipcRenderer.invoke(`${classKey}-${functionName}`, ...args);
      }
    }

    // Events
    if (plugins[pluginKey][classKey].prototype instanceof EventEmitter) {
      const listeners: { [key: string]: { type: string; listener: (...args: any[]) => void } } = {};
      const listenersOfTypeExist = (type) =>
        !!Object.values(listeners).find((listenerObj) => listenerObj.type === type);

      Object.assign(contextApi[classKey], {
        addEventListener(type: string, callback: (...args) => void) {
          const id = randomId();

          const eventHandler = (_, ...args) => callback(...args);

          ipcRenderer.addListener(`event-${classKey}-${type}`, eventHandler);
          ipcRenderer.send(`event-add-${classKey}`, type);
          listeners[id] = { type, listener: eventHandler };

          return id;
        },
        removeEventListener(id: string) {
          if (!listeners[id]) {
            throw new Error('Invalid id');
          }

          const { type, listener } = listeners[id];

          ipcRenderer.removeListener(`event-${classKey}-${type}`, listener);
          delete listeners[id];

          if (!listenersOfTypeExist(type)) {
            ipcRenderer.send(`event-remove-${classKey}`, type);
          }
        },
      });
    }
  }
}

contextBridge.exposeInMainWorld('CapacitorCustomPlatform', {
  name: 'electron',
  plugins: contextApi,
});

export { contextApi };

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { app, ipcMain } from "electron";
import electronIsDev from "electron-is-dev";
import type { CapacitorElectronExtendedConfig } from "./definitions";
import electronServe from "electron-serve";
const mimeTypes = require("mime-types");
const EventEmitter = require("events");

// Disable logging in prod
if (!electronIsDev) {
  console.log = () => {};
}

class CapElectronEmitter extends EventEmitter {}

export const CapElectronEventEmitter = new CapElectronEmitter();

export function getWebAppLoader(customUrlScheme: string) {
  return electronServe({
    directory: join(app.getAppPath(), "app"),
    // The scheme can be changed to whatever you'd like (ex: someapp)
    scheme: customUrlScheme,
  });
}

export function deepMerge(target: any, _objects: any[] = []) {
  // Credit for original function: Josh Cole(saikojosh)[https://github.com/saikojosh]
  const quickCloneArray = function (input: any) {
    return input.map(cloneValue);
  };
  const cloneValue = function (value: any) {
    if (getTypeOf(value) === "object") return quickCloneObject(value);
    else if (getTypeOf(value) === "array") return quickCloneArray(value);
    return value;
  };
  const getTypeOf = function (input: any) {
    if (input === null) return "null";
    else if (typeof input === "undefined") return "undefined";
    else if (typeof input === "object")
      return Array.isArray(input) ? "array" : "object";
    return typeof input;
  };
  const quickCloneObject = function (input: any) {
    const output: any = {};
    for (const key in input) {
      if (!input.hasOwnProperty(key)) {
        continue;
      }
      output[key] = cloneValue(input[key]);
    }
    return output;
  };
  const objects = _objects.map((object) => object || {});
  const output = target || {};
  for (let oindex = 0; oindex < objects.length; oindex++) {
    const object = objects[oindex];
    const keys = Object.keys(object);
    for (let kindex = 0; kindex < keys.length; kindex++) {
      const key = keys[kindex];
      const value = object[key];
      const type = getTypeOf(value);
      const existingValueType = getTypeOf(output[key]);
      if (type === "object") {
        if (existingValueType !== "undefined") {
          const existingValue =
            existingValueType === "object" ? output[key] : {};
          output[key] = deepMerge({}, [existingValue, quickCloneObject(value)]);
        } else {
          output[key] = quickCloneObject(value);
        }
      } else if (type === "array") {
        if (existingValueType === "array") {
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

export function pick<T>(
  object: Record<string, T>,
  keys: string[]
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(object).filter(([key]) => keys.includes(key))
  );
}

export function setupCapacitorElectronPlugins() {
  //setupListeners
  const rtPluginsPath = join(
    app.getAppPath(),
    "node_modules",
    "@capacitor-community",
    "electron",
    "dist",
    "runtime",
    "electron-plugins.js"
  );
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const AsyncFunction = (async () => {}).constructor;
  const plugins: any = require(rtPluginsPath);
  const pluginFunctionsRegistry: any = {};
  const pluginInstanceRegistry: Record<string, any> = {};
  for (const pluginKey of Object.keys(plugins)) {
    console.log(pluginKey);
    for (const classKey of Object.keys(plugins[pluginKey]).filter(
      (className) => className !== "default"
    )) {
      const classInstance = plugins[pluginKey][classKey];
      const functionHandler = (functionName: string, pluginRef: any, theCall: any) => {
        return ipcMain.on(
          `${classKey}-${functionName}`,
          (event, id, ...args) => {
            const handle = async () => {
              console.log("args", args);
              console.log("theCall", theCall);
              const call = theCall.call(pluginRef, ...args);
              const isPromise =
                theCall instanceof Promise ||
                theCall instanceof AsyncFunction ||
                call instanceof Promise;
              console.log("isPromise", isPromise);
              if (isPromise) {
                const returnVal = await call;
                event.reply(
                  `${classKey}-${functionName}-reply`,
                  id,
                  returnVal ?? null
                );
              } else {
                event.returnValue = call;
              }
            };

            handle().catch((error) => {
              console.error(error);
              event.returnValue = error;
            });
          }
        );
      }

      if (!classInstance.prototype && classInstance instanceof Function) {
        pluginFunctionsRegistry[classKey] = functionHandler(classKey, pluginFunctionsRegistry[classKey], classInstance);
      } else {
        const functionList = Object.getOwnPropertyNames(classInstance.prototype).filter((v) => v !== "constructor");
        console.log("  ", classKey);
        console.log("    " + JSON.stringify(functionList));
        console.log("");

        if (!pluginFunctionsRegistry[classKey]) {
          pluginInstanceRegistry[classKey] = new classInstance();
          pluginFunctionsRegistry[classKey] = {};
        }

        for (const functionName of functionList) {
          if (!pluginFunctionsRegistry[classKey][functionName]) {
            pluginFunctionsRegistry[classKey][functionName] = functionHandler(functionName, pluginInstanceRegistry[classKey], classInstance[functionName]);
          }
        }
      }
    }
  }
}

export async function encodeFromFile(filePath: string): Promise<string> {
  if (!filePath) {
    throw new Error("filePath is required.");
  }
  let mediaType = mimeTypes.lookup(filePath);
  if (!mediaType) {
    throw new Error("Media type unrecognized.");
  }
  const fileData = readFileSync(filePath);
  mediaType = /\//.test(mediaType) ? mediaType : "image/" + mediaType;
  let dataBase64 = Buffer.isBuffer(fileData)
    ? fileData.toString("base64")
    : Buffer.from(fileData).toString("base64");
  return "data:" + mediaType + ";base64," + dataBase64;
}

export function getCapacitorConfig() {
  let config: CapacitorElectronExtendedConfig = {};
  let capFileConfig: any = {};
  if (existsSync(join(app.getAppPath(), "build", "capacitor.config.js"))) {
    capFileConfig = require(join(
      app.getAppPath(),
      "build",
      "capacitor.config.js"
    )).default;
  } else {
    capFileConfig = JSON.parse(
      readFileSync(join(app.getAppPath(), "capacitor.config.json")).toString()
    );
  }
  if (capFileConfig.electron)
    config = deepMerge(config, [
      {
        ...capFileConfig.electron,
        ...pick(capFileConfig, ["backgroundColor", "appId", "appName"]),
      },
    ]);
  return config;
}

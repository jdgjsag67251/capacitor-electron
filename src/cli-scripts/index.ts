/* eslint-disable @typescript-eslint/no-unused-vars */
import { doAdd } from './add';
import { runTask } from './common';
import { doCopy } from './copy';
import { doOpen } from './open';
import { doUpdate } from './update';

const isVerbose = !!process.env.VERBOSE;

async function doUpdateTask() {
  return await runTask('Updating Electron plugins', async (taskInfoMessageProvider) => {
    return await doUpdate(taskInfoMessageProvider);
  });
}

async function doAddTask() {
  return await runTask('Adding Electron platform', async (taskInfoMessageProvider) => {
    return doAdd(taskInfoMessageProvider);
  });
}

async function doCopyTask() {
  return await runTask('Copying Web App to Electron platform', async (taskInfoMessageProvider) => {
    return await doCopy(taskInfoMessageProvider);
  });
}

async function doOpenTask() {
  return await runTask('Opening Electron platform', async (taskInfoMessageProvider, context) => {
    return await doOpen(taskInfoMessageProvider, { ...context, isVerbose });
  });
}

(async () => {
  const scriptToRun = process.argv[2] ? process.argv[2] : null;
  if (scriptToRun !== null) {
    switch (scriptToRun) {
      case 'add':
        await doAddTask();
        await doCopyTask();
        await doUpdateTask();
        break;
      case 'copy':
        await doCopyTask();
        break;
      case 'run':
        await doOpenTask();
        break;
      case 'open':
        await doOpenTask();
        break;
      case 'update':
        await doUpdateTask();
        break;
      case 'sync':
        await doCopyTask();
        await doUpdateTask();
        break;
      default:
        throw new Error(`Invalid script chosen: ${scriptToRun}`);
    }
  } else {
    throw new Error(`Invalid script chosen: ${scriptToRun}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

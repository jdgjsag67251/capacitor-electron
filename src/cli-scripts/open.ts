import { join } from 'node:path';

import type { TaskInfoContext, TaskInfoProvider } from './common';
import { errorLog, runExec } from './common';

export async function doOpen(
  taskInfoMessageProvider: TaskInfoProvider,
  context: TaskInfoContext & { isVerbose: boolean }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const usersProjectDir = process.env.CAPACITOR_ROOT_DIR!;
  const destDir = join(usersProjectDir, 'electron');
  try {
    taskInfoMessageProvider('building electron app');
    taskInfoMessageProvider('running electron app');
    if (context.isVerbose) {
      context.spinner.stop();
    }
    await runExec(`cd ${destDir} && npm run --silent electron:start-live`, { withOutput: context.isVerbose });
  } catch (e) {
    errorLog(e.message);
    throw e;
  }
}

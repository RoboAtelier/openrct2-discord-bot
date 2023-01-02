/**
 * Asynchronously pauses a task for the specified amount of time.
 * @async
 * @param value The amount of time to wait for.
 * @param unit The unit of time.
 */
export async function wait(value: number, unit: 'ms' | 's' | 'min' = 'ms') {
  let totalWait = value;
  switch (unit) {
    case('s'):
      totalWait *= 1000;
      break;
    case('min'):
      totalWait *= 1000 * 60
      break;
  };
  await new Promise(resolve => setTimeout(resolve, totalWait));
};
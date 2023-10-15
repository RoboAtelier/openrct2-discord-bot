import { exec } from 'child_process';

/**
 * Asynchronously pauses a task for the specified amount of time (default ms).
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

export async function getLinuxDistroInfo() {
  const output = await new Promise<string>(resolve => {
    let output = '';
    const terminal = exec('cat /etc/os-release');
    terminal.on('data', data => output += data);
    terminal.on('close', () => resolve(output));
  });

  const idMatch = output.match(/ID="*([a-z]+)/);
  const idLikeMatch = output.match(/ID_LIKE="*([a-zA-Z ]+)/);
  const versionIdMatch = output.match(/VERSION_ID="*(\w+)/);
  if (idMatch && versionIdMatch) {
    if (idLikeMatch && idLikeMatch[1].includes('ubuntu')) {
      const ubuntuCodeNameMatch = output.match(/UBUNTU_CODENAME="*([a-z]+)/);
      if (ubuntuCodeNameMatch) {
        return {
          distro: 'ubuntu',
          version: versionIdMatch[1], 
          codeName: ubuntuCodeNameMatch[1]
        };
      } else {
        throw new Error('Detected Linux distro to be Ubuntu or Ubuntu-like, but could not identify its version codename.');
      };
    } else {
      const versionCodeNameMatch = output.match(/VERSION_CODENAME="*([a-z]+)/);
      return {
        distro: idMatch[1],
        version: versionIdMatch[1],
        codeName: versionCodeNameMatch ? versionCodeNameMatch[1] : undefined
      };
    };
  };
  throw new Error('Could not determine Linux distribution and version.');
};
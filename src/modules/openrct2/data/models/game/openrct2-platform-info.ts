import os from 'os';

/** Represents a valid OS platform that OpenRCT2 can be run on. */
export type OpenRCT2Platform = typeof OpenRCT2PlatformArray[number];
const OpenRCT2PlatformArray = <const>['win32', 'darwin', 'linux'];

/** Represents a valid Linux distro that OpenRCT2 can be run on. */
export type OpenRCT2LinuxDistro = typeof OpenRCT2LinuxDistroArray[number];
const OpenRCT2LinuxDistroArray = <const>['ubuntu', 'debian'];

/** Represents platform information for an OpenRCT2 runtime target. */
export class OpenRCT2PlatformInfo {
  constructor(
    /** Gets the name of the operating system platform. */
    public readonly name: OpenRCT2Platform,

    /** Gets the target operating system CPU architecture. */
    public readonly architecture = os.arch(),

    /** Gets the target operating system version. */
    public readonly version = os.version(),

    /** Gets the target Linux operating system distribution that OpenRCT2 can run on. */
    public readonly distro?: OpenRCT2LinuxDistro,

    /** Gets the codename of a Linux operating system version. */
    public readonly codeName?: string
  ) {};

  /** Gets a more recognizable name of the operating system platform. */
  get friendlyName() {
    switch (this.name) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      case 'linux':
        return this.distro ?? 'linux';
      default:
        throw new Error('Could not return a friendly operating system name.');
    }
  };
};
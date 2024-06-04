import os from 'os';

/** Represents a valid OS platform that OpenRCT2 can be run on. */
export type OpenRCT2Platform = typeof OpenRCT2PlatformArray[number];
const OpenRCT2PlatformArray = <const>['win32', 'darwin', 'linux'];

/** Represents a valid Linux distro that OpenRCT2 can be run on. */
export type OpenRCT2LinuxDistro = typeof OpenRCT2LinuxDistroArray[number];
const OpenRCT2LinuxDistroArray = <const>['ubuntu', 'debian'];

/** Represents platform information for an OpenRCT2 runtime target. */
export class OpenRCT2PlatformInfo {
  
  /** Gets the name of the operating system platform. */
  readonly name: OpenRCT2Platform;

  /** Gets the target operating system CPU architecture. */
  readonly architecture: string;

  /** Gets the target operating system version. */
  readonly version: string;

  /** Gets the target Linux operating system distribution that OpenRCT2 can run on. */
  readonly distro?: OpenRCT2LinuxDistro;

  /** Gets the codename of a Linux operating system version. */
  readonly codeName?: string;

  constructor(
    platformName: OpenRCT2Platform,
    architecture?: string,
    version?: string,
    distro?: OpenRCT2LinuxDistro,
    codeName?: string
  ) {
    this.name = platformName;
    this.architecture = architecture ?? os.arch();
    this.version = version ?? os.version();
    this.distro = distro;
    this.codeName = codeName;
  };

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
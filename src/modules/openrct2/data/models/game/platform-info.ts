export type ArchitectureType = typeof ArchitectureTypeArray[number];
export const ArchitectureTypeArray = <const>['arm', 'arm64', 'i686', 'universal', 'win32', 'x64', 'x86_64'];

/** Represents platform information for an OpenRCT2 runtime target. */
export class PlatformInfo {
  constructor(
    /** Gets the name of the operating system platform. */
    public readonly name: string,

    /** Gets the target operating system CPU architecture. */
    public readonly architecture?: string,

    /** Gets the target operating system version. */
    public readonly version?: string,

    /** Gets the target Linux operating system distribution that OpenRCT2 can run on. */
    public readonly distro?: string,

    /** Gets the codename of a Linux operating system version. */
    public readonly codeName?: string
  ) {};

  get friendlyName() {
    switch (this.name as NodeJS.Platform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      case 'linux':
        return `${this.distro ?? this.name}${this.codeName ? `-${this.codeName}` : ''}`;
      case 'android':
        return 'android';
      default:
        return '';
    };
  };
};
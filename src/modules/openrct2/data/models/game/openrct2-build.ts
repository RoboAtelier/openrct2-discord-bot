import path from 'path';
import { lstatSync } from 'fs';

/** Represents information on a decompiled OpenRCT2 build. */
export class OpenRCT2Build {

  /** Gets the directory path to the build. */
  readonly path: string;

  /** Gets the primary version number of the build. */
  readonly baseVersion: string;

  /** Gets the version commit header of the build. */
  readonly commitHeader?: string;

  /** Gets the operating system name that the build is built for. */
  readonly os: string;

  /** Gets the operation system architecture of the build. */
  readonly architecture: string;

  constructor(path: string) {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) {
      throw new Error(`Expected a directory from ${path} for a game build object.`);
    };
    
    this.path = path;
    const nameSplit = this.name.split('_');
    if (/^v\d+\.\d+\.\d+(?:\-[0-9a-f]{7})?$/.test(nameSplit[0])) {
      if (nameSplit[0].includes('-')) {
        const versionSplit = nameSplit[0].split('-');
        this.baseVersion = versionSplit[0];
        this.commitHeader = versionSplit[1];
      } else {
        this.baseVersion = nameSplit[0];
      };
    } else {
      throw new Error('The directory name is not in the expected format.');
    };

    this.os = nameSplit[1];
    this.architecture = nameSplit[2];
  };

  /** Gets the full version header of the build. */
  get version() {
    if (this.commitHeader) {
      return `${this.baseVersion}-${this.commitHeader}`;
    };
    return this.baseVersion;
  };

  /** Gets the name of the OpenRCT2 build directory. */
  get name() {
    return path.basename(this.path);
  };

  /** Gets the file path to the OpenRCT2 game executable. */
  get pathToExecutable() {
    if (this.os === 'windows') {
      return path.join(this.path, 'openrct2.com');
    } else {
      return path.join(this.path, 'openrct2');
    };
  };
};
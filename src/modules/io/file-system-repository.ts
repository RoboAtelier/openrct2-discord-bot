import { Configuration } from '@modules/configuration';
import { ConcurrentDirectory } from '.';

/**
 * Represents a data repository that provides
 * simplified access to file system objects and its data.
 */
export abstract class FileSystemRepository {

  /** The directory that contains the managed data for this instance. */
  protected abstract dataDir: ConcurrentDirectory;

  constructor(config: Configuration) {

  };

  /** Gets the directory path to the managed repository data directory. */
  get dirPath() {
    return this.dataDir.path;
  };

  /** Frees resources or managed objects, and deactivates this class instance. */
  abstract dispose(): void;
};
import path from 'path';
import { Mutex } from 'async-mutex';
import { 
  isStringNullOrWhiteSpace,
  isStringValidForFileName,
  isStringValidForDirPath as isStringValidForPath
} from '@modules/utils/string-utils';

/** 
 * Represents a class for handling concurrent processes
 * on a specified file system object.
 * @abstract
 */
export abstract class ConcurrentFileSystemObject {
  
  /** 
   * A collection of managed file system objects
   * to track current mutex instances.
   */
  protected static readonly fsObjMutexes = new Map<string, { mutex: Mutex, instances: number }>();
  
  /** Specifies if this instance is being managed. */
  protected objActive = false;

  /** The full path to the managed file system object. */
  protected objPath: string;

  /** The mutex instance that handles locks on concurrent I/O processes. */
  protected ioMutex: Mutex;

  constructor(objPath: string) {
    const resolvedObjPath = path.resolve(objPath);
    this.objPath = resolvedObjPath;
    const fsMutex = ConcurrentFileSystemObject.fsObjMutexes.get(this.objPath);
    if (fsMutex !== undefined) {
      this.ioMutex = fsMutex.mutex;
      ++fsMutex.instances;
      ConcurrentFileSystemObject.fsObjMutexes.set(this.objPath, fsMutex);
    } else {
      const fsMutex = { mutex: new Mutex(), instances: 1 };
      this.ioMutex = fsMutex.mutex;
      ConcurrentFileSystemObject.fsObjMutexes.set(this.objPath, fsMutex);
    };

    this.objActive = true;
  };

  /** Gets the path to the managed file system object. */
  get path() {
    return `${this.objPath}`;
  };

  /** Gets a value specifying if this instance is active. */
  get isActive() {
    return this.objActive && !isStringNullOrWhiteSpace(this.objPath);
  };

  /** Frees the managed file system object and deactivates this class instance. */
  dispose() {
    this.objActive = false;
    const fsMutex = ConcurrentFileSystemObject.fsObjMutexes.get(this.objPath);
    if (fsMutex !== undefined) {
      if (1 === fsMutex.instances) {
        ConcurrentFileSystemObject.fsObjMutexes.delete(this.objPath);
      } else {
        --fsMutex.instances;
        ConcurrentFileSystemObject.fsObjMutexes.set(this.objPath, fsMutex);
      };
    };
    this.objPath = '';
  };

  /** Checks if this instance is currently managing a file system object. */
  protected validateActive() {
    if (!this.objActive) {
      throw Error(
        'This concurrent file system object instance is not active.'
        + ' A new instance must be created.');
    };
  };

  /**
   * Checks that a file name is valid.
   * @param fileName The name of the file to validate.
   */
  protected validateFileName(fileName: string) {
    if (!isStringValidForFileName(fileName)) {
      throw new Error('Specified name is not a valid file name.');
    };
  };

  /**
   * Checks that a file system path or path name is valid.
   * @param fsPath The name of the file system path or name to validate.
   */
  protected validatePath(fsPath: string) {
    if (!isStringValidForPath(fsPath)) {
      throw new Error('Specified string is not a valid file system path or name.');
    };
  };
};
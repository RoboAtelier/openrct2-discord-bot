import path from 'path';
import {
  Mutex,
  MutexInterface
} from 'async-mutex';
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
  
  /** A collection of managed file system objects to track current mutex instances. */
  protected static readonly fsObjMutexes = new Map<string, { mutex: Mutex, instances: number }>();

  /** Gets the mutex instance that handles locks on I/O processes. */
  protected readonly ioMutex: Mutex;

  /** Gets an arbitrary value to permit I/O processes on locked processes.*/
  protected transactionKey?: number;

  /** Gets the timeout function on an acquired lock. */
  protected lockTimeout?: NodeJS.Timeout;

  /** Specifies if this instance is being managed. */
  protected objActive = false;

  /** Gets the full path to the managed file system object. */
  protected objPath: string;

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
    this.ioMutex.cancel();
  };

  /**
   * Acquires a lock on the file system object. 
   * @param lifetimeMs The length of time in milliseconds to keep the lock for.
   * @async 
   * @returns A permission value to run an action on the locked object.
   */
  async lock(lifetimeMs = 30000) {
    await this.ioMutex.acquire();
    this.lockTimeout = setTimeout(this.ioMutex.release, lifetimeMs);
    const lockKey = Date.now();
    this.transactionKey = lockKey;
    return lockKey;
  };

  /**
   * Releases the lock on the file system object.
   * @param transactionKey The permission value initially assigned from locking an object.
   */
  unlock(transactionKey: number) {
    if (this.transactionKey === transactionKey) {
      this.ioMutex.release();
      clearTimeout(this.lockTimeout);
      this.lockTimeout = undefined;
      this.transactionKey = undefined;
      return true;
    };
    return false;
  };

  /** Checks if this instance is currently managing a file system object. */
  protected validateActive() {
    if (!this.objActive) {
      throw Error('This concurrent file system object instance is not active. A new instance must be created.');
    };
  };

  /**
   * Checks that a file name is valid.
   * @param fileName The name of the file to validate.
   */
  protected validateFileName(fileName: string) {
    if (!isStringValidForFileName(fileName)) {
      throw new Error(`Specified name ${fileName} is not a valid file name.`);
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
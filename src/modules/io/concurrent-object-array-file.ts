import path from 'path';
import { 
  readFileSync,
  writeFileSync
} from 'fs';
import { 
  readFile,
  writeFile
} from 'fs/promises';
import { 
  ConcurrentFileSystemObject,
  SerializableToArray
} from './index.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

/** 
 * Represents a class for handling concurrent processes
 * on a file system file with a serialized object data array.
 */
export class ConcurrentObjectArrayFile<T extends SerializableToArray<T>> extends ConcurrentFileSystemObject {
  private typeObj: T;

  constructor(filePath: string, typeObj: T) {
    const resolvedFilePath = path.resolve(filePath);
    super(resolvedFilePath);
    this.typeObj = typeObj;
    try {
      const fileData = readFileSync(resolvedFilePath, 'utf8');
      if (isStringNullOrWhiteSpace(fileData)) {
        writeFileSync(resolvedFilePath, typeObj.toDataArrayString([]));
      } else {
        typeObj.fromDataArrayString(fileData);
      };
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code && errno.code.includes('ENOENT')) {
        writeFileSync(resolvedFilePath, typeObj.toDataArrayString([]));
      } else {
        throw err;
      };
    };
  };

  /**
   * Reads the object data array of the file with concurrency locking.
   * @async
   * @param transactionKey A permission value to run an action on a locked object.
   * @returns File contents as the object array.
   */
  async readExclusive(transactionKey?: number) {
    this.validateActive();
    if (this.ioMutex.isLocked() && this.transactionKey === transactionKey) {
      const dataStr = await readFile(this.objPath, 'utf8');
      return this.typeObj.fromDataArrayString(dataStr);
    };
    return this.ioMutex.runExclusive(async () => { 
      const dataStr = await readFile(this.objPath, 'utf8');
      return this.typeObj.fromDataArrayString(dataStr);
    });
  };

  /**
   * Writes a managed object array into the file with concurrency locking.
   * @async
   * @param obj The object array to serialize and write into the file.
   * @param transactionKey A permission value to run an action on a locked object.
   */
  async writeExclusive(obj: T[], transactionKey?: number) {
    this.validateActive();
    if (this.ioMutex.isLocked() && this.transactionKey === transactionKey) {
      const dataStr = this.typeObj.toDataArrayString(obj);
      return writeFile(this.objPath, dataStr);
    };
    return this.ioMutex.runExclusive(async () => {
      const dataStr = this.typeObj.toDataArrayString(obj);
      return writeFile(this.objPath, dataStr);
    });
  };
};
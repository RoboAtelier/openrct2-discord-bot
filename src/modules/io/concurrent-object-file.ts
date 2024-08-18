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
  SerializableObject
} from './index.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

/** 
 * Represents a class for handling concurrent processes
 * on a file system file with serialized object data.
 */
export class ConcurrentObjectFile<T extends SerializableObject<T>> extends ConcurrentFileSystemObject {
  private typeObj: T;

  constructor(filePath: string, typeObj: T) {
    const resolvedFilePath = path.resolve(filePath);
    super(resolvedFilePath);
    this.typeObj = typeObj;
    try {
      const fileData = readFileSync(resolvedFilePath, 'utf8');
      if (isStringNullOrWhiteSpace(fileData)) {
        writeFileSync(resolvedFilePath, typeObj.toDataString());
      } else {
        typeObj.fromDataString(fileData);
      };
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code && errno.code.includes('ENOENT')) {
        writeFileSync(resolvedFilePath, typeObj.toDataString());
      } else {
        throw err;
      };
    };
  };

  /**
   * Reads the object data of the file with concurrency locking.
   * @async
   * @param transactionKey A permission value to run an action on a locked object.
   * @returns File contents as the object type.
   */
  async readExclusive(transactionKey?: number) {
    this.validateActive();
    if (this.ioMutex.isLocked() && this.transactionKey === transactionKey) {
      const dataStr = await readFile(this.objPath, 'utf8');
      return this.typeObj.fromDataString(dataStr);
    };
    return this.ioMutex.runExclusive(async () => { 
      const dataStr = await readFile(this.objPath, 'utf8');
      return this.typeObj.fromDataString(dataStr);
    });
  };

  /**
   * Writes a managed object into the file with concurrency locking.
   * @async
   * @param transactionKey A permission value to run an action on a locked object.
   * @param obj The object to serialize and write into the file.
   */
  async writeExclusive(obj: T, transactionKey?: number) {
    this.validateActive();
    if (this.ioMutex.isLocked() && this.transactionKey === transactionKey) {
      const dataStr = obj.toDataString();
      return writeFile(this.objPath, dataStr);
    };
    return this.ioMutex.runExclusive(async () => {
      const dataStr = obj.toDataString();
      return writeFile(this.objPath, dataStr);
    });
  };
};
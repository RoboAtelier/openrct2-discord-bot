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
} from '.';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

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
   * Reads the object data of the file with locking.
   * @async
   * @returns File contents as the object type.
   */
  async readExclusive() {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => { 
      const dataStr = await readFile(this.objPath, 'utf8');
      return this.typeObj.fromDataString(dataStr);
    });
  };

  /**
   * Writes a managed object into the file.
   * @async
   * @param obj The object to serialize and write into the file.
   */
  async writeExclusive(obj: T) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      const dataStr = obj.toDataString();
      return writeFile(this.objPath, dataStr);
    });
  };
};
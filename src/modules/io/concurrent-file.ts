import path from 'path';
import { Abortable } from 'events';
import { 
  Mode,
  ObjectEncodingOptions,
  OpenMode,
  readFileSync,
  statSync,
  writeFileSync
} from 'fs';
import { 
  readFile,
  writeFile
} from 'fs/promises';
import { Stream } from 'stream';
import { ConcurrentFileSystemObject } from '.';
import { isStringNullOrEmpty } from '@modules/utils/string-utils';

/** 
 * Represents a class for handling concurrent processes
 * on a generic file system file.
 */
export class ConcurrentFile extends ConcurrentFileSystemObject {
  constructor(filePath: string, defaultData = '', setDefaultOnLoad = false) {
    const resolvedFilePath = path.resolve(filePath);
    super(resolvedFilePath);
    try {
      const fileStat = statSync(resolvedFilePath);
      if (!fileStat.isFile()) {
        throw new Error('Specified path is not a file system file.');
      };

      const fileData = readFileSync(resolvedFilePath, 'utf8');
      if (isStringNullOrEmpty(fileData) || setDefaultOnLoad) {
        writeFileSync(resolvedFilePath, defaultData);
      };
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code && errno.code.includes('ENOENT')) {
        writeFileSync(resolvedFilePath, defaultData);
      } else {
        throw err;
      };
    };
  };

  /**
   * Reads the entire contents of the file with locking.
   * @async
   * @param options Either the encoding for the result, or an object that contains the encoding and an optional flag.
   * If a flag is not provided, it defaults to `'r'`. If no option is specified,
   * the default encoding used is `'utf8'` with the default flag `'r'`.
   * @returns File contents as a string.
   */
  async readExclusive(
    options: 
      | ({
          encoding: BufferEncoding;
          flag?: string | undefined;
        } & Abortable)
      | BufferEncoding = 'utf8'
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => { 
      return readFile(this.objPath, options);
    });
  };

  /**
   * Writes data to the file with locking.
   * @async
   * @param data The data to write. If something other than a Buffer or Uint8Array is provided,
   * the value is coerced to a string.
   */
  async writeExclusive(
    data: 
      | string
      | NodeJS.ArrayBufferView
      | Iterable<string | NodeJS.ArrayBufferView>
      | AsyncIterable<string | NodeJS.ArrayBufferView>
      | Stream,
    options?:
      | (ObjectEncodingOptions & {
            mode?: Mode | undefined;
            flag?: OpenMode | undefined;
        } & Abortable)
      | BufferEncoding
      | null
  ) {
    this.validateActive();
    return this.ioMutex.runExclusive(async () => {
      return writeFile(this.objPath, data, options);
    });
  };
};

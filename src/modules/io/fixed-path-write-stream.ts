import { WriteStream } from 'fs';

/** Represents a standard `WriteStream` but `path` is readonly. */
export interface FixedPathWriteStream extends Omit<WriteStream, 'path'> {
  
  /**
   * The path to the file the stream is writing to.
   * This value is readonly.
   */
  readonly path: string | Buffer;
};
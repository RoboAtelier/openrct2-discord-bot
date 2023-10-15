import { ReadStream } from 'fs';

/** Represents a standard `ReadStream` but `path` is readonly. */
export interface FixedPathReadStream extends Omit<ReadStream, 'path'> {

  /**
   * The path to the file the stream is reading from.
   * This value is readonly.
   */
  readonly path: string | Buffer;
};
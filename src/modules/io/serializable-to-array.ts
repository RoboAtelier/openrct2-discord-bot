import { SerializableObject } from '.';

/** Contains contracts for handling an array of serialized objects. */
export abstract class SerializableToArray<T> extends SerializableObject<T> {

  /** 
   * Initializes an array of objects from a formatted data array string.
   * @param dataStr A data string representing a serialized array.
   * @returns A new object array instance from the serialized data.
   */
  abstract fromDataArrayString(dataStr: string): T[];

  /**
   * Converts an array of objects of this type into a data array string to be stored.
   * @param dataArray The array of objects to be serialized.
   * @returns The object array serialized into a data string.
   */
  abstract toDataArrayString(dataArray: T[]): string;
};
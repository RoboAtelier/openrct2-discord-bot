/** Represents an object that can handle serialization operations on itself. */
export abstract class SerializableObject<T> {

  /** 
   * Initializes an object instance from a formatted data string.
   * @param dataStr A data string representing a serialized object.
   * @returns A new object instance from the serialized data.
   */
  abstract fromDataString(dataStr: string): T;

  /**
   * Converts the object into a data string to be stored.
   * @returns The object serialized into a data string.
   */
  abstract toDataString(): string;

  /** 
   * Checks that a given object is a valid matching instance of this class type.
   * @param obj The object to check.
   * @returns `true` if the object matches in property types; otherwise, `false`.
   */
  isMatchingType(obj: any): obj is T {
    const thisObjProperties = Object.getOwnPropertyNames(this) as Array<keyof this>;
    return thisObjProperties.every(property => {
      const thisPropertyType = typeof this[property];
      const otherPropertyType = typeof obj[property];
      if ('object' === thisPropertyType) {
        return this.checkPropertyObjectsMatch(this[property], obj[property]);
      } else if ('function' !== thisPropertyType) {
        return thisPropertyType === otherPropertyType;
      };
      return true;
    });
  };

  /** 
   * Checks that a given object is a valid partial instance of this class type.
   * @param obj The object to check.
   * @returns `true` if the object matches at least one property type; otherwise, `false`.
   */
  isPartialType(obj: any): boolean {
    const thisObjProperties = Object.getOwnPropertyNames(this) as Array<keyof this>;
    return thisObjProperties.some(property => {
      const thisPropertyType = typeof this[property];
      const otherPropertyType = typeof obj[property];
      if ('object' === thisPropertyType) {
        return this.checkPropertyObjectsMatch(this[property], obj[property]);
      } else if ('function' !== thisPropertyType) {
        return thisPropertyType === otherPropertyType;
      };
      return true;
    });
  };

  /**
   * Checks that two property objects match in type.
   * @param obj1 First object to compare with.
   * @param obj2 Second object to compare with.
   * @returns `true` if the property objects match in type; otherwise, `false`.
   */
  checkPropertyObjectsMatch(obj1: any, obj2: any): boolean {
    const obj1Type = typeof obj1;
    const obj2Type = typeof obj2;
    if ('object' === obj1Type && 'object' === obj2Type) {
      if (Array.isArray(obj1) && Array.isArray(obj2)) { //assume all arrays are any[]
        return true;
      };
      const obj1Properties = Object.getOwnPropertyNames(obj1);
      return obj1Properties.every(property => {
        return this.checkPropertyObjectsMatch(obj1[property], obj2[property]);
      });
    } else if ('object' === obj1Type && 'string' === obj2Type) { // handling specifically dates
      const dateCheck = new Date(obj2);
      if (!isNaN(dateCheck.getTime())) {
        return this.checkPropertyObjectsMatch(obj1, dateCheck);
      };
    };
    return obj1Type === obj2Type;
  };
};
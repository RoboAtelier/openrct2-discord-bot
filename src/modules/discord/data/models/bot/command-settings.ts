import { SerializableObject } from '@modules/io/index.js';

/** Represents command settings for the Discord bot application. */
export class CommandSettings extends SerializableObject<CommandSettings> {
  constructor(
    /** Gets or sets a value specifying if commands are restricted to only administrators. */
    public adminRestricted = false,
  ) {
    super();
    this.adminRestricted = adminRestricted;
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new CommandSettings() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new CommandSettings(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${CommandSettings.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};
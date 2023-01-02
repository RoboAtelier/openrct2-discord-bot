import { SerializableObject } from '@modules/io';

/** 
 * Represents configuration settings
 * for the server machine hosting OpenRCT2 servers.
 */
export class ServerHostConfiguration extends SerializableObject<ServerHostConfiguration> {

  /** Gets or sets the number of minutes to wait between switching scenarios. */
  queueIntermissionTime: number

  constructor(
    queueIntermissionTime = 1,
  ) {
    super()
    this.queueIntermissionTime = queueIntermissionTime;
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new ServerHostConfiguration() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new ServerHostConfiguration(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${ServerHostConfiguration.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};
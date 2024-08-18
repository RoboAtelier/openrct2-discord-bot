import { SerializableObject } from '@modules/io/index.js';

/** Represents startup options for a hosted OpenRCT2 game server instance. */
export class StartupOptions extends SerializableObject<StartupOptions> {
  constructor(
    /** Gets or sets the target executable to run to start the OpenRCT2 game server instance. */
    public openRCT2ExecutablePath = '',

    /** Gets or sets the port number that a game server would be running on. */
    public port = -1,

    /** Gets or sets the password for regulating game server entry. */
    public password = '',

    /** Specifies if a game server will run as a headless server. */
    public headless = false,

    /** Specifies if a game server will output more detailed debug messages. */
    public verbose = false,

    /** Specifies if a game server finalizes automatically on scenario completion. */
    public autoFinalize = false,

    /** Specifies if a game server will track scenario victories and failures. */
    public keepScore = false,
    
    /** Gets or sets the number of minutes to delay for on a deferred server start.*/
    public delayDuration = 1
  ) {
    super();
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new StartupOptions() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new StartupOptions(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${StartupOptions.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};
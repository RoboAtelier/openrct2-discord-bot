import { SerializableObject } from '@modules/io';

/** Represents startup options for a hosted OpenRCT2 game server instance. */
export class StartupOptions extends SerializableObject<StartupOptions> {

  /** Gets or sets the port number that a game server would be running on. */
  port: number;

  /** Gets or sets the password for regulating game server entry. */
  password: string;

  /** Specifies if a game server will run as a headless server. */
  headless: boolean;

  /** Specifies if a game server will output more detailed debug messages. */
  verbose: boolean;

  /** Specifies if a game server finalizes automatically on scenario completion. */
  autoFinalize: boolean;

  /** Specifies if a game server will track scenario victories and failures. */
  keepScore: boolean;

  /** Specifies if a game server will use managed bot plugins. */
  useBotPlugins: boolean;
  
  /** Gets or sets the number of minutes to delay for on a deferred server start.*/
  delayDuration: number;

  constructor(
    port = -1,
    password = '',
    headless = false,
    verbose = false,
    autoFinalize = false,
    keepScore = false,
    usePlugin = false,
    delayDuration = 1
  ) {
    super();
    this.port = port;
    this.password = password;
    this.headless = headless;
    this.verbose = verbose;
    this.autoFinalize = autoFinalize;
    this.keepScore = keepScore;
    this.useBotPlugins = usePlugin;
    this.delayDuration = delayDuration;
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
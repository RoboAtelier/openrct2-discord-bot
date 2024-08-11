import { SerializableObject } from '@modules/io';

/** Represents a status snapshot of a OpenRCT2 game server's runtime. */
export class ServerStatus extends SerializableObject<ServerStatus> {
  constructor(
    /** Gets or sets the scenario file name that the game server started on. */
    public initiatedScenarioFileName = '',

    /** Gets or sets the current running scenario file name. */
    public currentScenarioFileName = '',

    /** Gets or sets the previous scenario file name ran by the game server. */
    public previousScenarioFileName = '',

    /** Gets or sets the value specifying if the current scenario is completed. */
    public isCurrentScenarioCompleted: boolean | null = null,

    /** Gets or sets the most recent startup timestamp of the current scenario. */
    public lastStartupTime = new Date(0)
  ) {
    super();
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new ServerStatus() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new ServerStatus(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${ServerStatus.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};
import { SerializableObject } from '@modules/io';

/** Represents a status snapshot of a OpenRCT2 game server's runtime. */
export class ServerStatus extends SerializableObject<ServerStatus> {

  /** Gets or sets the scenario file name that the game server started on. */
  initiatedScenarioFileName: string;

  /** Gets or sets the current running scenario file name. */
  currentScenarioFileName: string;

  /** Gets or sets the previous scenario file name ran by the game server. */
  previousScenarioFileName: string;

  /** Gets or sets the value specifying if the current scenario is completed. */
  isCurrentScenarioCompleted: boolean | null;

  /** Gets or sets the most recent startup timestamp of the current scenario. */
  lastStartupTime: Date;

  constructor(
    initiatedScenarioFileName = '',
    currentScenarioFileName = '',
    previousScenarioFileName = '',
    isCurrentScenarioCompleted = null,
    lastStartupTime = new Date(0)
  ) {
    super();
    this.initiatedScenarioFileName = initiatedScenarioFileName;
    this.currentScenarioFileName = currentScenarioFileName;
    this.previousScenarioFileName = previousScenarioFileName;
    this.isCurrentScenarioCompleted = isCurrentScenarioCompleted;
    this.lastStartupTime = lastStartupTime;
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
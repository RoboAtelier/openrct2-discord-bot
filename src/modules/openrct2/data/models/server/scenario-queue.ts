import { SerializableObject } from '@modules/io';

/** Represents queues and queue settings for a OpenRCT2 game server. */
export class ScenarioQueue extends SerializableObject<ScenarioQueue> {

  /** Gets or sets the current queue of scenarios waiting to start for a game server. */
  waitingScenarios: string[];

  /** Gets or sets how large the scenario queue can be. */
  size: number;

  constructor(
    waitingScenarios: string[] = [],
    size = 3
  ) {
    super();
    this.waitingScenarios = waitingScenarios;
    this.size = size;
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new ScenarioQueue() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new ScenarioQueue(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${ScenarioQueue.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};
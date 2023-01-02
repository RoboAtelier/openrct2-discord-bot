import { SerializableObject } from '@modules/io';

/** Represents queues and queue settings for a OpenRCT2 game server. */
export class ServerQueue extends SerializableObject<ServerQueue> {

  /** Gets or sets the current queue of scenarios waiting to start for a game server. */
  scenarioQueue: string[];

  /** Gets or sets how large the scenario queue can be. */
  scenarioQueueSize: number;

  constructor(
    scenarioQueue: string[] = [],
    scenarioQueueSize = 3
  ) {
    super();
    this.scenarioQueue = scenarioQueue;
    this.scenarioQueueSize = scenarioQueueSize;
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new ServerQueue() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new ServerQueue(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${ServerQueue.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};
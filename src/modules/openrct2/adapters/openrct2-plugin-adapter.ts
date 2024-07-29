import { Socket } from 'net';
import { EventEmitter } from 'events';

export declare interface OpenRCT2PluginAdapter {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on(event: 'data', listener: (args: PluginEventArgs<keyof AdapterResponseValueTypes>) => void): this;
};

export interface AdapterRequestArgTypes {
  'chat': string;
  'group.list': undefined;
  'pause.toggle': undefined;
  'player.group.set': {
    playerId: number,
    groupId: number
  }; 
  'player.list': undefined;
  'save': undefined;
  'scenario': undefined;
  'screenshot': undefined;
};

export interface AdapterResponseValueTypes {
  'chat': void;
  'group.list': {
    id: number,
    name: string
  }[];
  'pause.toggle': void;
  'player.group.set': {
    id: number,
    name: string,
    group: string,
  };
  'player.list': {
    id: number,
    name: string,
    group: string,
  }[];
  'save': string;
  'scenario': {
    name: string
    details: string
    filename: string
    status: 'inProgress' | 'completed' | 'failed',
    ticks: number
  };
  'screenshot': string;
};

/** Represents arguments returned from an emitted plugin event. */
export class PluginEventArgs<V extends keyof AdapterResponseValueTypes> {
  constructor(
    public readonly eventName: V,
    public readonly data?: AdapterResponseValueTypes[V]
  ) {};
};

/**
 * Represents an adapter to communicate with a OpenRCT2 game server instance
 * with a TCP server port opened by a plugin.
 */
export class OpenRCT2PluginAdapter extends EventEmitter {
  private static readonly pluginResponseRegex = /([a-z\.]+);([0-9]+|e);([^\n]*?);\n/g;

  private readonly client: Socket;

  constructor(client: Socket) {
    super();
    this.client = client;
    this.client.on('data', data => this.onData(data));
    this.setMaxListeners(20);
  };

  /** Closes the adapter client and disconnects it from the game server instance. */
  close() {
    this.client.destroy();
    this.client.removeAllListeners();
  };

  /**
   * Sends an action request to the game server instance.
   * @async
   * @param action The action name to execute.
   * @param userId The id of the user that called the action.
   * @param args Arguments to pass to the plugin call.
   * @returns A result from executing the plugin action.
   */
  async executeAction<A extends keyof AdapterRequestArgTypes>(
    action: A,
    userId: string,
    args?: AdapterRequestArgTypes[A],
    timeoutMs = 10 * 1000
  ): Promise<AdapterResponseValueTypes[A]> {
    const actionStr = typeof args === 'string' || args == null
      ? `${action};${userId};${args}`
      : `${action};${userId};${JSON.stringify(args)}`
    
    this.client.write(actionStr);
    const result = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Plugin action '${action}' timed out.`));
      }, timeoutMs);
      this.once(`${action}${userId}`, data => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
    return result;
  };

  /**
   * An event handler for when the adapter client sends back data.
   * @param data The response as a buffer array.
   */
  private onData(data: Buffer) {
    const dataStr = data.toString('utf8');
    console.log(dataStr);
    const responseArray = Array.from(dataStr.matchAll(OpenRCT2PluginAdapter.pluginResponseRegex));
    if (responseArray.length > 0) {
      for (const response of responseArray) {
        const eventName = response[1] as keyof AdapterResponseValueTypes;
        const eventInitiator = response[2];
        let eventData = response[3];
        try {
          eventData = JSON.parse(response[3]);
        } catch { };

        if ('e' === eventInitiator) {
          const args = new PluginEventArgs(eventName, eventData);
          this.emit('data', args);
        } else {
          this.emit(`${eventName}${eventInitiator}`, eventData);
        };
      };
    };
  };
};
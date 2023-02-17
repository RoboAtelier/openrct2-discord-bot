import { Socket } from 'net';
import { EventEmitter } from 'events';

export declare interface OpenRCT2PluginAdapter {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on(event: 'data', listener: (args: PluginEventArgs) => void): this;
};

export interface PluginActions {
  'chat': string;
  'player.list': undefined;
  'save': undefined;
  'scenario': undefined;
  'screenshot': undefined;
};

interface PluginActionResultValues {
  'chat': void;
  'player.list': {
    name: string,
    group: string,
  }[];
  'save': string;
  'scenario': {
    name: string
    details: string
    filename: string
    status: 'inProgress' | 'completed' | 'failed'
  };
  'screenshot': string;
};

/** Represents arguments returned from an emitted plugin event. */
export class PluginEventArgs {
  readonly eventName: string;
  readonly data: any;

  constructor(eventName: string, data: unknown) {
    this.eventName = eventName;
    this.data = data;
  };
};

/**
 * Represents an adapter to communicate with a OpenRCT2 game server instance
 * with a TCP server port opened by a plugin.
 */
export class OpenRCT2PluginAdapter extends EventEmitter {
  private static readonly pluginResponseRegex = /([a-z\.]+)_([0-9]+|e)_([\s\S]*?)\n/g;
  private static readonly timeoutMs = 10000;

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
   * There is a maximum timeout of 15 seconds for executing an action.
   * @async
   * @param action The action name to execute.
   * @param userId The id of the user that called the action.
   * @param args Arguments to pass to the plugin call.
   * @returns A result from executing the plugin action.
   */
  async executeAction<A extends keyof PluginActions>(
    action: A,
    userId: string,
    args?: PluginActions[A]
  ): Promise<PluginActionResultValues[A]> {
    const actionStr = args === undefined || args === null
      ? `${action};${userId}`
      : typeof args === 'string'
      ? `${action};${userId};${args}`
      : `${action};${userId};${JSON.stringify(args)}`
    
    this.client.write(actionStr);
    const result = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Plugin action '${action}' timed out.`));
      }, OpenRCT2PluginAdapter.timeoutMs);
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
        const eventName = response[1];
        const eventInitiator = response[2];
        let eventData: unknown = response[3];
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
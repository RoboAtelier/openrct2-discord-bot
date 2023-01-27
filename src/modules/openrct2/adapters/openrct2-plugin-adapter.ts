import { Socket } from 'net';
import { EventEmitter } from 'events';
import { Logger } from '@modules/logging';

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
  'scenario': string;
  'screenshot': string;
};

interface PluginActionResultValues {
  'chat': void;
  'scenario': {
    name: 'string'
    details: 'string'
    filename: 'string'
    status: 'inProgress' | 'completed' | 'failed'
  };
  'screenshot': string;
};

/** Represents arguments returned from an emitted plugin event. */
export class PluginEventArgs {
  readonly eventName: string;
  readonly data: string;

  constructor(eventName: string, data: string) {
    this.eventName = eventName;
    this.data = data;
  };
};

/**
 * Represents an adapter to communicate with a OpenRCT2 game server instance
 * with a TCP server port opened by a plugin.
 */
export class OpenRCT2PluginAdapter extends EventEmitter {
  private static readonly actionResponseRegex = /^([a-z.]+)_([0-9]+)_(.*)$/;
  private static readonly serverEventRegex = /^([a-z.]+)_(.*)$/;
  private static readonly timeoutMs = 10000;

  private readonly client: Socket;
  private readonly logger: Logger;

  constructor(client: Socket, logger: Logger) {
    super();
    this.client = client;
    this.logger = logger;

    this.client.on('data', data => this.onData(data));
    this.setMaxListeners(20);
  };

  /** Closes the adapter client and disconnects it from the game server instance. */
  close() {
    this.client.destroy();
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
    try {
      const dataStr = data.toString('utf8');
      this.logger.writeLog(dataStr);
      const responseMatch = dataStr.match(OpenRCT2PluginAdapter.actionResponseRegex);
      if (responseMatch) { // action response
        const actionName = responseMatch[1];
        const userId = responseMatch[2];
        let actionData: any = responseMatch[3];
        try {
          actionData = JSON.parse(responseMatch[3]);
        } catch { };
  
        this.emit(`${actionName}${userId}`, actionData);
      } else {
        const eventMatch = dataStr.match(OpenRCT2PluginAdapter.serverEventRegex);
        if (eventMatch) { // event response
          const eventName = eventMatch[1];
          const eventData = eventMatch[2];
  
          const args = new PluginEventArgs(eventName, eventData);
          this.emit('data', args);
        } else {
          // log
        };
      };
    } catch (err) {
      this.logger.writeError(err as Error);
    };
  };
};
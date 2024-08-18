/// <reference path="../../../../plugins/messaging.d.ts" />

import { Socket } from 'net';
import { EventEmitter } from 'events';

export declare interface MessagingPluginAdapter {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on(event: 'data', listener: (args: PluginEventArgs<keyof MessagingPlugin.Response>) => void): this;
};

/** Represents arguments returned from an emitted plugin event. */
export class PluginEventArgs<R extends keyof MessagingPlugin.Response> {
  constructor(
    public readonly eventName: R,
    public readonly data?: MessagingPlugin.Response[R]
  ) {};
};

/**
 * Represents an adapter to communicate with a OpenRCT2 game server instance
 * with a TCP server port opened by a plugin.
 */
export class MessagingPluginAdapter extends EventEmitter {
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
   * Sends an action or query request to the game server instance.
   * @async
   * @param requestName The action or query name to execute.
   * @param userId The id of the user that called the action.
   * @param args Arguments to pass to the plugin call.
   * @param timeoutMs The length of time in milliseconds before a request times out.
   * @returns A result from executing the plugin action.
   */
  async sendRequest<R extends keyof MessagingPlugin.Request>(
    requestName: R,
    userId: string,
    args?: MessagingPlugin.Request[R],
    timeoutMs = 10 * 1000
  ): Promise<MessagingPlugin.RequestResponse[R]> {
    const actionStr = typeof args === 'string' || args == null
      ? `${requestName};${userId};${args}`
      : `${requestName};${userId};${JSON.stringify(args)}`
    
    this.client.write(actionStr);
    const result = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Plugin action '${requestName}' timed out.`));
      }, timeoutMs);
      this.once(`${requestName}${userId}`, data => {
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
    const responseArray = Array.from(dataStr.matchAll(MessagingPluginAdapter.pluginResponseRegex));
    if (responseArray.length > 0) {
      for (const response of responseArray) {
        const eventName = response[1] as keyof MessagingPlugin.Response;
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
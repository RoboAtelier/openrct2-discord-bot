/// <reference path="../../../../plugins/messaging.d.ts" />

import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { 
  MessagingPluginAdapter,
  PluginEventArgs
} from '@modules/openrct2/adapters/index.js';
import { ScenarioFile } from '@modules/openrct2/data/models/index.js';

export declare interface OpenRCT2Server {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on<E extends keyof OpenRCT2ServerEvent>(
    event: E, listener: (args: ServerEventArgs<OpenRCT2ServerEvent[E]>) => void
  ): this;

  /**
   * Synchronously calls each of the listeners registered for the event named `eventName`,
   * in the order they were registered, passing the supplied arguments to each.
   * @param eventName The name of the event being emitted.
   * @param args Event arguments to pass to all listeners.
   * @returns `true` if the event had listeners, `false` otherwise.
   */
  emit<E extends keyof OpenRCT2ServerEvent>(
    eventName: E | string, args: ServerEventArgs<OpenRCT2ServerEvent[E]>
  ): boolean;
};

export interface OpenRCT2ServerEvent extends Omit<MessagingPlugin.Response, 'interval.day'> {
  'close': {
    code: number | null,
    signal: NodeJS.Signals | null
  };
  'error': Error;
  'scenario.update': {
    currentScenarioFileName: string;
    scenarioStatus: 'inProgress' | 'completed' | 'failed';
  };
  'stop': boolean;
};

/** Represents arguments returned from an emitted game server event. */
export class ServerEventArgs<T> {
  readonly serverId: number;
  readonly data: T;
  readonly message: string;

  constructor(serverId: number, data: T, message = '') {
    this.serverId = serverId;
    this.data = data;
    this.message = message;
  };
};

/** Represents an OpenRCT2 game server instance. */
export class OpenRCT2Server extends EventEmitter {
  private static readonly pollingTimeMs = 1 * 1000 * 60 * 2;

  private _scenarioName: string;
  private _currentScenarioFileName: string;
  private _scenarioStatus?: 'inProgress' | 'completed' | 'failed';
  private lastTicks: number;

  /** Gets the id of this OpenRCT2 game server. */
  readonly id: number;

  /** Gets the game server instance. */
  readonly gameInstance: ChildProcess;

  /** Gets the scenario file that the OpenRCT2 game server started on. */
  readonly initiatedScenarioFile: ScenarioFile;

  /** 
   * Gets the messaging plugin adapter client to remotely execute
   * actions or queries on the game server instance.
   */
  readonly pluginAdapter?: MessagingPluginAdapter;

  constructor(
    id: number,
    gameInstance: ChildProcess,
    initiatedScenarioFile: ScenarioFile,
    pluginAdapter?: MessagingPluginAdapter
  ) {
    super();
    this.id = id;
    this.gameInstance = gameInstance;
    this.pluginAdapter = pluginAdapter;
    this.initiatedScenarioFile = initiatedScenarioFile;
    this._scenarioName = initiatedScenarioFile.nameNoExtension;
    this._currentScenarioFileName = initiatedScenarioFile.name;
    this.lastTicks = 0;
    
    gameInstance.once('close', (code, signal) => this.onClose(code, signal));
    gameInstance.on('error', err => this.onError(err));
    if (this.pluginAdapter) {
      this.pluginAdapter.on('data', data => this.onPluginData(data));
    };
  };

  /** Gets the name of the scenario that is active on the server. */
  get scenarioName() {
    return this._scenarioName;
  };

  /** Gets the current scenario status. */
  get scenarioStatus() {
    return this._scenarioStatus;
  };

  /** Gets the name of the scenario file the server opened on. */
  get currentScenarioFileName() {
    return this._currentScenarioFileName;
  };

  /** Stops and closes the game server instance. */
  stop() {
    if (this.pluginAdapter) {
      this.pluginAdapter.close();
    };
    this.gameInstance.kill('SIGKILL'); // force skip save prompt
    this.removeAllListeners();
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
  async executePluginRequest<R extends keyof MessagingPlugin.Request>(
    requestName: R,
    userId: string,
    args?: MessagingPlugin.Request[R],
    timeoutMs = 10 * 1000
  ) {
    if (this.pluginAdapter) {
      return await this.pluginAdapter.sendRequest(requestName, userId, args, timeoutMs);
    };
    throw new Error(`Could not run plugin action. Server ${this.id} does not have the adapter plugin active.`);
  };

  /**
   * An event handler for when the relay plugin adapter sends back data.
   * @param pluginArgs The response as event arguments from the plugin.
   */
  private onPluginData(pluginArgs: PluginEventArgs<keyof MessagingPlugin.Response>) {
    if (pluginArgs.eventName === 'server.status' && pluginArgs.data) {
      const scenarioData = pluginArgs.data as MessagingPlugin.Response[typeof pluginArgs.eventName];
      this._scenarioName = scenarioData.name ? scenarioData.name : 'Unnamed';

        if (this._currentScenarioFileName !== scenarioData.fileName || this._scenarioStatus !== scenarioData.status) {
          this._currentScenarioFileName = scenarioData.fileName;
          this._scenarioStatus = scenarioData.status;

          const args = new ServerEventArgs(
            this.id,
            {
              currentScenarioFileName: scenarioData.fileName,
              scenarioStatus: scenarioData.status
            }
          );
          this.emit('scenario.update', args);
        };

        this.lastTicks = scenarioData.ticks;
    } else {
      const args = new ServerEventArgs(this.id, pluginArgs.data);
      this.emit(pluginArgs.eventName, args);
    };
  };

  /**
   * An event handler for when the game server instance closes.
   * @param code The exit code if the game server instance exited on its own.
   * @param signal The signal by which the game server instance was terminated with.
   */
  private onClose(code: number | null, signal: NodeJS.Signals | null) {
    const message = `Server ${this.id} has stopped.`;
    const args = new ServerEventArgs(this.id, { code, signal }, message);
    this.emit('close', args);
  };

  /**
   * An event handler for errors thrown by game server instance.
   * @param err The error thrown by the game server instance.
   */
  private onError(err: Error) {
    const message = `Server ${this.id} has encountered an error.`;
    const args = new ServerEventArgs(this.id, err, message);
    this.emit('error', args);
  };
};
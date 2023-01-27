import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { 
  OpenRCT2PluginAdapter,
  PluginEventArgs
} from '@modules/openrct2/adapters';
import { ScenarioFile } from 'modules/openrct2/data/models';
import { wait } from '@modules/utils/runtime-utils';

export declare interface OpenRCT2Server {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on<E extends keyof OpenRCT2ServerEvents>(
    event: E, listener: (args: ServerEventArgs<OpenRCT2ServerEvents[E]>) => void
  ): this;

  /**
   * Synchronously calls each of the listeners registered for the event named `eventName`,
   * in the order they were registered, passing the supplied arguments to each.
   * @param eventName The name of the event being emitted.
   * @param args Event arguments to pass to all listeners.
   * @returns `true` if the event had listeners, `false` otherwise.
   */
  emit<E extends keyof OpenRCT2ServerEvents>(
    eventName: E | string, args: ServerEventArgs<OpenRCT2ServerEvents[E]>
  ): boolean;
};

export interface OpenRCT2ServerEvents {
  'close': {
    code: number | null,
    signal: NodeJS.Signals | null
  };
  'error': Error;
  'stop': boolean;
  'scenario.update': {
    currentScenarioFileName: string;
    scenarioStatus: 'inProgress' | 'completed' | 'failed';
  };
  'network.chat': string;
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
  private static readonly pollingTimeMs = 60000;

  private scenarioName: string;
  private currentScenarioFileName: string;
  private scenarioStatus: 'inProgress' | 'completed' | 'failed' | null = null;

  /** Gets the id of this OpenRCT2 game server. */
  readonly id: number;

  /** Gets the game server instance. */
  readonly gameInstance: ChildProcess;

  /** Gets the scenario file that the OpenRCT2 game server started on. */
  readonly initiatedScenarioFile: ScenarioFile;

  /** 
   * Gets or sets the relay plugin adapter client to remotely execute
   * actions in the game server instance.
   */
  pluginAdapter: OpenRCT2PluginAdapter | null;

  constructor(
    id: number,
    gameInstance: ChildProcess,
    initiatedScenarioFile: ScenarioFile,
    pluginAdapter: OpenRCT2PluginAdapter | null = null
  ) {
    super();
    this.id = id;
    this.gameInstance = gameInstance;
    this.pluginAdapter = pluginAdapter;
    this.initiatedScenarioFile = initiatedScenarioFile;
    this.scenarioName = initiatedScenarioFile.nameNoExtension;
    this.currentScenarioFileName = initiatedScenarioFile.name;
    
    gameInstance.once('close', (code, signal) => this.onClose(code, signal));
    gameInstance.on('error', err => this.onError(err));
    if (this.pluginAdapter) {
      this.pluginAdapter.on('data', data => this.onPluginData(data));
      this.pollScenarioData();
    };
  };

  async getScenarioName() {
    return this.scenarioName;
  };

  async getActualScenarioFileName() {
    return this.currentScenarioFileName;
  };

  async isCurrentScenarioCompleted() {
    return this.scenarioStatus;
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
   * 
   */
  private async pollScenarioData() {
    while (this.gameInstance.exitCode === null) {
      await wait(OpenRCT2Server.pollingTimeMs);
      try {
        const baseScenarioData = await this.pluginAdapter!.executeAction('scenario', `${this.id}`);
        this.scenarioName = baseScenarioData.name;

        if (
          this.currentScenarioFileName !== baseScenarioData.filename
          || this.scenarioStatus === null
          || this.scenarioStatus !== baseScenarioData.status
        ) {
          this.currentScenarioFileName = baseScenarioData.filename;
          this.scenarioStatus = baseScenarioData.status;

          const args = new ServerEventArgs(
            this.id,
            {
              currentScenarioFileName: baseScenarioData.filename,
              scenarioStatus: baseScenarioData.status
            }
          );
          this.emit('scenario.update', args);
        };
      } catch (err) {
        // logging
      };
    };
  };

  /**
   * An event handler for when the relay plugin adapter sends back data.
   * @param pluginArgs The response as event arguments from the plugin.
   */
  private onPluginData(pluginArgs: PluginEventArgs) {
    const args = new ServerEventArgs(this.id, pluginArgs.data);
    this.emit(pluginArgs.eventName, args);
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
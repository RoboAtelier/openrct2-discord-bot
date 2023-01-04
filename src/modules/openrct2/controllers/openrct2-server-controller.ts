import path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Socket } from 'net';
import { Configuration } from '@modules/configuration';
import { OpenRCT2PluginAdapter } from '@modules/openrct2/adapters';
import {
  ScenarioFile,
  StartupOptions
} from '@modules/openrct2/data/models';
import {
  ServerHostRepository,
  ScenarioRepository
} from '@modules/openrct2/data/repositories';
import { 
  OpenRCT2Server,
  ServerEventArgs
} from '@modules/openrct2/runtime';
import { wait } from '@modules/utils/runtime-utils';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

export declare interface OpenRCT2ServerController {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on<E extends keyof OpenRCT2ServerControllerEvents>(
    event: E, listener: (args: ServerEventArgs<OpenRCT2ServerControllerEvents[E]>) => void
  ): this;

  /**
   * Synchronously calls each of the listeners registered for the event named `eventName`,
   * in the order they were registered, passing the supplied arguments to each.
   * @param eventName The name of the event being emitted.
   * @param args Event arguments to pass to all listeners.
   * @returns `true` if the event had listeners, `false` otherwise.
   */
  emit<E extends keyof OpenRCT2ServerControllerEvents>(
    eventName: E, args: ServerEventArgs<OpenRCT2ServerControllerEvents[E]>
  ): boolean;
};

/** 
 * Contains event names and their respective callback function definitions
 * for the `OpenRCT2ServerController` class.
 */
export interface OpenRCT2ServerControllerEvents {
  'server.start': ScenarioFile;
  'server.restart': {
    autosaveIndex: number
  };
  'server.stop': {
    success: boolean
  };
  'server.close': {
    code: number | null,
    signal: NodeJS.Signals | null
  };
  'server.error': Error;
  'server.network.chat': string;
  'server.defer.start': {
    scenarioFile: ScenarioFile,
    delayDuration: number
  };
  'server.defer.stop': ScenarioFile;
  'server.scenario.complete': {
    scenarioFile: ScenarioFile | undefined,
    scenarioStatus: "completed" | "failed"
  };
};

export class OpenRCT2ServerController extends EventEmitter {
  private static readonly exePathKey = 'openRCT2ExecutablePath';
  private static readonly startupTimeoutMs = 30000;

  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerHostRepository;
  private readonly openRCT2ExecutablePath: string;
  private readonly gameServers = new Map<number, OpenRCT2Server>();
  private readonly activeStarts = new Map<number, boolean>();
  private readonly activeDeferrals = new Map<number, ScenarioFile | null>();
  private readonly activeProcesses = new Map<number, boolean>();

  constructor(
    config: Configuration,
    scenarioRepo: ScenarioRepository,
    serverHostRepo: ServerHostRepository
  ) {
    super();
    this.scenarioRepo = scenarioRepo;
    this.serverHostRepo = serverHostRepo;
    const exePath = config.getValue<string>(OpenRCT2ServerController.exePathKey);
    this.openRCT2ExecutablePath = path.resolve(exePath);
  };

  getActiveGameServerById(serverId: number) {
    return this.gameServers.get(serverId);
  };

  isGameServerOnDelayedStart(serverId: number) {
    return this.activeDeferrals.has(serverId);
  };

  isGameServerStarting(serverId: number) {
    return this.activeStarts.has(serverId);
  };

  isGameServerProcessRunning(serverId: number) {
    return this.activeProcesses.has(serverId);
  };

  /**
   * 
   * @param serverId 
   * @param scenarioFile 
   */
  async startGameServerOnScenario(serverId: number, scenarioFile: ScenarioFile) {
    if (!this.isGameServerStarting(serverId)) {
      this.activeStarts.set(serverId, true);

      try {
        const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
        const deferredScenario = this.activeDeferrals.get(serverId);
        if (deferredScenario) {
          this.activeDeferrals.set(serverId, null);
          this.emit('server.defer.stop', new ServerEventArgs(serverId, deferredScenario));
        };
        if (this.gameServers.has(serverId)) {
          await this.stopGameServer(serverId, false);
        };
  
        const metadata = await this.scenarioRepo.getScenarioMetadataForFile(scenarioFile);
        const startupOptions = await serverDir.getStartupOptions();
        const status = await serverDir.getStatus();
  
        if (!isStringNullOrWhiteSpace(status.currentScenarioFileName)) {
          status.previousScenarioFileName = `${status.currentScenarioFileName}`;
        };
        status.initiatedScenarioFileName = scenarioFile.name;
        status.currentScenarioFileName = scenarioFile.name;
        status.isCurrentScenarioCompleted = null;
        status.lastStartupTime = new Date();
        ++metadata.plays;

        const gameServer = await this.createGameServerInstance(
          serverId,
          serverDir.path,
          scenarioFile,
          startupOptions
        );
        this.gameServers.set(serverId, gameServer);
        await serverDir.updateStatus(status);
        await this.scenarioRepo.updateScenarioMetadata(metadata);
        this.captureServerEvents(gameServer);
        this.emit('server.start', new ServerEventArgs(serverId, scenarioFile));
      } catch (err) {
        throw err;
      } finally {
        this.activeStarts.delete(serverId);
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param autosaveIndex 
   */
  async startGameServerOnAutosave(serverId: number, autosaveIndex = 0) {
    if (!this.isGameServerStarting(serverId)) {
      try {
        const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
        const deferredScenario = this.activeDeferrals.get(serverId);
        if (deferredScenario) {
          this.activeDeferrals.set(serverId, null);
          this.emit('server.defer.stop', new ServerEventArgs(serverId, deferredScenario));
        };
        if (this.gameServers.has(serverId)) {
          await this.stopGameServer(serverId, false);
        };
    
        const latestAutosave = await serverDir.getScenarioAutosave(autosaveIndex);
        const startupOptions = await serverDir.getStartupOptions();
        const status = await serverDir.getStatus();
    
        status.lastStartupTime = new Date();

        const gameServer = await this.createGameServerInstance(
          serverId,
          serverDir.path,
          latestAutosave,
          startupOptions
        );
        this.gameServers.set(serverId, gameServer);
        await serverDir.updateStatus(status);
        this.captureServerEvents(gameServer);
        this.emit('server.restart', new ServerEventArgs(serverId, { autosaveIndex: autosaveIndex }));
      } catch (err) {
        throw err;
      } finally {
        this.activeStarts.delete(serverId);
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param scenarioFile 
   */
  async startGameServerOnScenarioDeferred(serverId: number, scenarioFile: ScenarioFile) {
    if (!this.activeDeferrals.has(serverId)) {
      this.activeDeferrals.set(serverId, scenarioFile);

      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const startupOptions = await serverDir.getStartupOptions();
      const startTime = Date.now() + (startupOptions.delayDuration * 60000);

      this.emit(
        'server.defer.start',
        new ServerEventArgs(serverId, { scenarioFile: scenarioFile, delayDuration: startupOptions.delayDuration })
      );
      await new Promise<void>(async resolve => {
        while (Date.now() < startTime && this.activeDeferrals.get(serverId)) {
          await wait(1, 's');
        };
        if (this.activeDeferrals.get(serverId)) {
          this.activeDeferrals.set(serverId, null);
          try {
            await this.startGameServerOnScenario(serverId, scenarioFile);
          } catch { };
        };
        resolve();
      });

      this.activeDeferrals.delete(serverId);
    };
  };

  async startGameServerFromQueue(serverId: number, defer = false) {
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.scenarioQueue.length > 0) {
      const scenariosInQueue = await Promise.all(queue.scenarioQueue.map(inQueue => {
        return this.scenarioRepo.getScenarioByName(inQueue);
      }));
      const validScenarios = scenariosInQueue.filter(inQueue => inQueue) as ScenarioFile[];
      queue.scenarioQueue = validScenarios.map(scenarioFile => scenarioFile.name);
      await serverDir.updateQueue(queue);

      const scenarioToRun = validScenarios.splice(0, 1)[0];
      if (defer) {
        await this.startGameServerOnScenarioDeferred(serverId, scenarioToRun);
      } else {
        await this.startGameServerOnScenario(serverId, scenarioToRun);
      };

      queue.scenarioQueue = validScenarios.map(scenarioFile => scenarioFile.name);
      await serverDir.updateQueue(queue);
    };
  };

  /**
   * 
   * @param serverId 
   * @param emitEvent 
   */
  async stopGameServer(serverId: number, emitEvent = true) {
    const deferredScenario = this.activeDeferrals.get(serverId);
    if (deferredScenario) {
      this.activeDeferrals.set(serverId, null);
      this.emit('server.defer.stop', new ServerEventArgs(serverId, deferredScenario));
    };

    let stopped = false;
    const gameServer = this.gameServers.get(serverId);
    if (gameServer) {
      gameServer.stop();
      this.gameServers.delete(serverId);
      stopped = true;
    };
    if (emitEvent) {
      this.emit('server.stop', new ServerEventArgs(serverId, { success: stopped }));
    };
  };

  async setServerScenarioAsCompleted(serverId: number, completionFlag?: 'win' | 'loss') {
    const gameServer = this.gameServers.get(serverId);

    if (gameServer) {
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const status = await serverDir.getStatus();
      const actual = await gameServer.getActualScenarioFileName();

      if (actual === gameServer.initiatedScenarioFile.name) {
        const metadata = await this.scenarioRepo.getScenarioMetadataByName(actual);
        if (metadata) {
          if ('win' === completionFlag) {
            ++metadata.wins;
          } else if ('loss' === completionFlag) {
            ++metadata.losses;
          };
          await this.scenarioRepo.updateScenarioMetadata(metadata);
        };
      };

      status.isCurrentScenarioCompleted = true;
      await serverDir.updateStatus(status);
    };
  };

  async addToServerScenarioQueue(serverId: number, scenarioFile: ScenarioFile) {
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
    const queue = await serverDir.getQueue();

    if (queue.scenarioQueueSize > 0 && queue.scenarioQueue.length < queue.scenarioQueueSize) {
      queue.scenarioQueue.push(scenarioFile.name);
      await serverDir.updateQueue(queue);

      const status = await serverDir.getStatus();
      if (status.isCurrentScenarioCompleted) {
        this.startGameServerFromQueue(serverId, true);
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param userId 
   */
  async createServerScreenshot(serverId: number, userId: string) {
    const gameServer = this.gameServers.get(serverId);
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);

    if (!this.isGameServerProcessRunning(serverId)) {
      this.activeProcesses.set(serverId, true);

      try {
        const result = { screenshotFilePath: '', scenarioName: '' };

        if (gameServer && gameServer.pluginAdapter) {
          const screenshotFileName = await gameServer.pluginAdapter.executeAction('screenshot', userId);
          result.screenshotFilePath = await serverDir.getScreenshotByName(screenshotFileName);
          result.scenarioName = await gameServer.getScenarioName();
        } else {
          const latestAutosave = await serverDir.getScenarioAutosave();
          const status = await serverDir.getStatus();
          const initiatedScenario = await this.scenarioRepo.getScenarioByName(status.initiatedScenarioFileName);
          result.screenshotFilePath = await this.createScenarioScreenshot(latestAutosave, `s${serverId}`);
          result.scenarioName = initiatedScenario ? initiatedScenario.nameNoExtension : latestAutosave.nameNoExtension;
        };

        return result;
      } catch (err) {
        throw err;
      } finally {
        this.activeProcesses.delete(serverId);
      };
    };

    throw new Error(`Server ${serverId} is busy with another process.`);
  };

  /**
   * 
   * @param scenarioFile 
   * @param screenshotName 
   */
  async createScenarioScreenshot(scenarioFile: ScenarioFile, screenshotName = '') {
    const screenshotFilePath = isStringNullOrWhiteSpace(screenshotName)
      ? path.join(this.serverHostRepo.dirPath, `${scenarioFile.nameNoExtension}.png`)
      : path.join(this.serverHostRepo.dirPath, `${screenshotName}.png`);
    const args = [
      'screenshot',
      scenarioFile.path,
      screenshotFilePath,
      'giant',
      '2', // zoom
      '0' // rotation
      // transparent by default
    ];

    const screenshotProcess = await spawn(
      this.openRCT2ExecutablePath,
      args,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Screenshot generation timed out.'));
      }, OpenRCT2ServerController.startupTimeoutMs);
      screenshotProcess.on('exit', async (code, signal) => {
        clearTimeout(timeout);
        resolve({ code: code, signal: signal });
      });
      screenshotProcess.on('error', err => {
        reject(err);
      });
      screenshotProcess.stdout.on('data', data => {}); // flush output stream
    });

    return screenshotFilePath;
  };

  private async createGameServerInstance(
    serverId: number,
    openRCT2DataPath: string,
    scenarioFile: ScenarioFile,
    startupOptions: StartupOptions
  ) {
    const params = ['host', scenarioFile.path, '--user-data-path', openRCT2DataPath, '--port'];
    if (startupOptions.port < Math.pow(2, 10) + 1 || startupOptions.port > Math.pow(2, 16) - 1) {
      throw new Error(`Invalid port number specified: ${startupOptions.port}`);
    };
    params.push(startupOptions.port.toString());
    if (!isStringNullOrWhiteSpace(startupOptions.password)) {
      params.push('--password');
      params.push(startupOptions.password);
    };
    if (startupOptions.headless) {
      params.push('--headless');
    };
    if (startupOptions.verbose) {
      params.push('--verbose');
    };

    const gameInstance = await spawn(
      this.openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    
    let launched = false;
    let pluginPassed = !startupOptions.useBotPlugins;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        gameInstance.kill('SIGKILL');
        reject(new Error('The game instance failed to start correctly.'))
      }, OpenRCT2ServerController.startupTimeoutMs);
      gameInstance.once('error', err => {
        reject(err);
      });
      gameInstance.stdout.on('data', (data: Buffer) => {
        const dataStr = data.toString('utf8');
        if (dataStr.includes(`ing for clients on *:${startupOptions.port}`)) {
          launched = true;
        } else if (dataStr.includes(`in for server ${serverId} has started`)) {
          pluginPassed = true;
        };
        if (launched && pluginPassed) {
          clearTimeout(timeout);
          gameInstance.stdout.removeAllListeners('data');
          gameInstance.removeAllListeners('error');
          resolve();
        };
      });
    });

    let pluginAdapter = null;
    if (startupOptions.useBotPlugins) {
      const client = new Socket();
      await client.connect(startupOptions.port, 'localhost');
      await new Promise<void>((resolve, reject) => {
        client.once('error', err => {
          reject(err);
        });
        client.once('connect', () => {
          client.removeAllListeners('error');
          resolve();
        });
      });
      pluginAdapter = new OpenRCT2PluginAdapter(client);
    };

    return new OpenRCT2Server(serverId, gameInstance, scenarioFile, pluginAdapter);
  };

  private onServerClose(args: ServerEventArgs<{ code: number | null, signal: NodeJS.Signals | null }>) {
    const gameServer = this.getActiveGameServerById(args.serverId);
    if (gameServer) {
      this.gameServers.delete(args.serverId);
    };
    this.emit('server.close', args);
  };

  private async onServerScenarioUpdate(args: ServerEventArgs<{
    currentScenarioFileName: string,
    scenarioStatus: 'inProgress' | 'completed' | 'failed'
  }>) {
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(args.serverId);
    const status = await serverDir.getStatus();

    status.currentScenarioFileName = args.data.currentScenarioFileName;
    if (!status.isCurrentScenarioCompleted) {
      status.isCurrentScenarioCompleted = args.data.scenarioStatus !== 'inProgress';
    };
    await serverDir.updateStatus(status);

    if (
      status.isCurrentScenarioCompleted
      && args.data.scenarioStatus !== 'inProgress'
    ) {
      // only count completions on uninterrupted runs
      if (!/^autosave_\d{4}-\d{2}-\d{2}/.test(status.currentScenarioFileName)) {
        const startupOptions = await serverDir.getStartupOptions();
        if (startupOptions.keepScore) {
          const metadata = await this.scenarioRepo.getScenarioMetadataByName(args.data.currentScenarioFileName);
          if (metadata) {
            'completed' === args.data.scenarioStatus ? ++metadata.wins : ++metadata.losses;
            await this.scenarioRepo.updateScenarioMetadata(metadata);
          };
        };
      };

      const scenarioFile = await this.scenarioRepo.getScenarioByName(status.currentScenarioFileName);
      const newArgs = new ServerEventArgs(
        args.serverId,
        { 
          scenarioFile: scenarioFile,
          scenarioStatus: args.data.scenarioStatus
        }
      );
      this.emit('server.scenario.complete', newArgs);
      this.startGameServerFromQueue(args.serverId, true);
    };
  };

  private captureServerEvents(gameServer: OpenRCT2Server) {
    gameServer.once('close', args => this.onServerClose(args));
    gameServer.on('error', args => this.emit('server.error', args));
    if (gameServer.pluginAdapter) {
      gameServer.on('network.chat', args => this.emit(
        'server.network.chat',
        new ServerEventArgs(args.serverId, args.data)
      ));
      gameServer.on('scenario.update', args => this.onServerScenarioUpdate(args));
    };
  };
};
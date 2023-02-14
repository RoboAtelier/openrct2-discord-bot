import { EventEmitter } from 'events';
import { Logger } from '@modules/logging';
import { PluginActions } from '@modules/openrct2/adapters';
import { ScenarioFile } from '@modules/openrct2/data/models';
import {
  ServerHostRepository,
  ScenarioRepository
} from '@modules/openrct2/data/repositories';
import { OpenRCT2ServerSubdirectoryName } from '@modules/openrct2/data/types';
import { 
  OpenRCT2ProcessEngine,
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
  'server.network.chat': {
    playerName: string,
    message: string
  };
  'server.network.join': {
    playerName: string;
  };
  'server.network.leave': {
    playerName: string;
  };
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
  private readonly logger: Logger;
  private readonly openRCT2ProcessEngine: OpenRCT2ProcessEngine;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerHostRepository;

  private readonly gameServers = new Map<number, OpenRCT2Server>();
  private readonly activeStarts = new Map<number, boolean>();
  private readonly activeDeferrals = new Map<number, ScenarioFile | null>();
  private readonly activeProcesses = new Map<number, boolean>();

  constructor(
    logger: Logger,
    openRCT2ProcessEngine: OpenRCT2ProcessEngine,
    scenarioRepo: ScenarioRepository,
    serverHostRepo: ServerHostRepository
  ) {
    super();
    this.logger = logger;
    this.openRCT2ProcessEngine = openRCT2ProcessEngine;
    this.scenarioRepo = scenarioRepo;
    this.serverHostRepo = serverHostRepo;
  };

  getActiveGameServerById(serverId: number) {
    return this.gameServers.get(serverId);
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
        const pluginOptions = await serverDir.getPluginOptions();
        const status = await serverDir.getStatus();
  
        if (!isStringNullOrWhiteSpace(status.currentScenarioFileName)) {
          status.previousScenarioFileName = `${status.currentScenarioFileName}`;
        };
        status.initiatedScenarioFileName = scenarioFile.name;
        status.currentScenarioFileName = scenarioFile.name;
        status.isCurrentScenarioCompleted = null;
        status.lastStartupTime = new Date();
        ++metadata.plays;

        const gameServer = await this.openRCT2ProcessEngine.createGameServerInstance(
          serverId,
          serverDir.path,
          scenarioFile,
          startupOptions,
          pluginOptions
        );
        this.gameServers.set(serverId, gameServer);
        await serverDir.updateStatus(status);
        await this.scenarioRepo.updateScenarioMetadata(metadata);
        this.captureServerEvents(gameServer);
        this.emit('server.start', new ServerEventArgs(serverId, scenarioFile));
        await this.logger.writeLog(`Server ${serverId} was launched on ${scenarioFile.name}.`);
      } catch (err) {
        await this.logger.writeError(err as Error);
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
        const pluginOptions = await serverDir.getPluginOptions();
        const status = await serverDir.getStatus();
    
        status.lastStartupTime = new Date();

        const gameServer = await this.openRCT2ProcessEngine.createGameServerInstance(
          serverId,
          serverDir.path,
          latestAutosave,
          startupOptions,
          pluginOptions
        );
        this.gameServers.set(serverId, gameServer);
        await serverDir.updateStatus(status);
        this.captureServerEvents(gameServer);
        this.emit('server.restart', new ServerEventArgs(serverId, { autosaveIndex: autosaveIndex }));
        await this.logger.writeLog(`Server ${serverId} was launched on autosave ${latestAutosave.name}.`);
      } catch (err) {
        await this.logger.writeError(err as Error);
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
      const now = Date.now();
      const startTime = now + (startupOptions.delayDuration * 60000);
      let remainingMinutes = startupOptions.delayDuration;
      let nextNoticeTime = now;

      await new Promise<void>(async resolve => {
        await this.logger.writeLog(`Server ${serverId} is on a deferred start launching ${scenarioFile.name}.`);
        while (Date.now() < startTime && this.activeDeferrals.get(serverId)) {
          if (Date.now() >= nextNoticeTime && nextNoticeTime < startTime) {
            this.emit(
              'server.defer.start',
              new ServerEventArgs(serverId, { scenarioFile: scenarioFile, delayDuration: remainingMinutes })
            );
            const gameServer = this.getActiveGameServerById(serverId);
            if (gameServer && gameServer.pluginAdapter) {
              try {
                const alert = `{YELLOW}Announcement: {WHITE}The server will change scenarios in ${remainingMinutes} ${
                  remainingMinutes > 1 ? 'minutes' : 'minute'
                }. Remember to save your game as needed.`
                await gameServer.pluginAdapter.executeAction('chat', `${serverId}`, alert);
              } catch { };
            };
            --remainingMinutes;
            nextNoticeTime += 60000;
          };
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
      await this.logger.writeLog(`Server ${serverId} is starting a queued scenario ${scenarioToRun.name}.`);
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
      await this.logger.writeError(`Server ${serverId} was stopped manually.`);
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
        await this.logger.writeLog(`Server ${serverId} got a ${completionFlag} on its current scenario.`);
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
      await this.logger.writeLog(`Server ${serverId} queued up ${scenarioFile.name}.`);
      const status = await serverDir.getStatus();
      if (status.isCurrentScenarioCompleted) {
        this.startGameServerFromQueue(serverId, true);
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param action 
   * @param userId 
   * @param args 
   * @returns 
   */
  async executePluginAction<A extends keyof PluginActions>(
    serverId: number,
    action: A,
    userId: string,
    args?: PluginActions[A]
  ) {
    const gameServer = this.getActiveGameServerById(serverId);
    if (gameServer) {
      if (gameServer.pluginAdapter) {
        const result = await gameServer.pluginAdapter.executeAction(action, userId, args);
        return result;
      };
      throw new Error(`Could not run plugin action. Server ${serverId} does not have the adapter plugin active.`);
    };
    throw new Error(`Could not run plugin action. Server ${serverId} is not active.`);
  };

  /**
   * 
   * @param serverId 
   * @param userId 
   */
  async createServerScreenshot(serverId: number, userId: string) {
    const gameServer = this.getActiveGameServerById(serverId);
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);

    if (!this.isGameServerProcessRunning(serverId)) {
      this.activeProcesses.set(serverId, true);

      try {
        const result: {
          screenshotFilePath: string,
          scenarioFile?: ScenarioFile,
          scenarioName: string,
          usedPlugin: boolean
        } = { screenshotFilePath: '', scenarioName: '', usedPlugin: false };

        if (gameServer && gameServer.pluginAdapter) {
          const startupOptions = await serverDir.getStartupOptions();
          if (startupOptions.headless) {
            const save = await this.createCurrentScenarioSave(serverId, userId);
            result.screenshotFilePath = await this.openRCT2ProcessEngine.createScenarioScreenshot(
              save.saveFile,
              serverDir.getSubdirectoryPath(OpenRCT2ServerSubdirectoryName.Screenshot),
              `s${serverId}_screenshot`
            );
            result.scenarioFile = save.saveFile;
            result.scenarioName = save.scenarioName;
          } else {
            const screenshotFileName = await gameServer.pluginAdapter.executeAction('screenshot', userId);
            result.screenshotFilePath = await serverDir.getScreenshotByName(screenshotFileName);
            result.scenarioName = await gameServer.getScenarioName();
          };
          result.usedPlugin = true;
        } else {
          const latestAutosave = await serverDir.getScenarioAutosave();
          const status = await serverDir.getStatus();
          const initiatedScenario = await this.scenarioRepo.getScenarioByName(status.initiatedScenarioFileName);
          result.screenshotFilePath = await this.openRCT2ProcessEngine.createScenarioScreenshot(
            latestAutosave,
            serverDir.getSubdirectoryPath(OpenRCT2ServerSubdirectoryName.Screenshot),
            `s${serverId}_screenshot`
          );
          result.scenarioFile = latestAutosave;
          result.scenarioName = initiatedScenario ? initiatedScenario.nameNoExtension : latestAutosave.nameNoExtension;
        };

        await this.logger.writeLog(`Created a screenshot of Server ${serverId}.`);
        return result;
      } catch (err) {
        await this.logger.writeError(err as Error);
        throw err;
      } finally {
        this.activeProcesses.delete(serverId);
      };
    };

    throw new Error(`Server ${serverId} is busy with another process.`);
  };

  async createCurrentScenarioSave(serverId: number, userId: string) {
    const gameServer = this.getActiveGameServerById(serverId);
    const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);

    try {
      if (gameServer && gameServer.pluginAdapter) {
        const saveFileName = await gameServer.pluginAdapter.executeAction('save', userId);
        await this.logger.writeLog(`Created a save file of Server ${serverId}.`);
        return {
          saveFile: await serverDir.getScenarioSaveByName(saveFileName.concat('.park')),
          scenarioName: await gameServer.getScenarioName(),
          usedPlugin: true
        };
      } else {
        const latestAutosave = await serverDir.getScenarioAutosave();
        const status = await serverDir.getStatus();
        const initiatedScenario = await this.scenarioRepo.getScenarioByName(status.initiatedScenarioFileName);
        await this.logger.writeLog(`Sharing latest autosave as the current save file for Server ${serverId}.`);
        return {
          saveFile: latestAutosave,
          scenarioName: initiatedScenario ? initiatedScenario.nameNoExtension : latestAutosave.nameNoExtension,
          usedPlugin: false
        };
      };
    } catch (err) {
      await this.logger.writeError(err as Error);
      throw err;
    };
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
      gameServer.on('network.join', args => this.emit(
        'server.network.join',
        new ServerEventArgs(args.serverId, { playerName: args.data })
      ));
      gameServer.on('network.leave', args => this.emit(
        'server.network.leave',
        new ServerEventArgs(args.serverId, { playerName: args.data })
      ));
      gameServer.on('scenario.update', args => this.onServerScenarioUpdate(args));
    };
  };
};
import { EventEmitter } from 'events';
import { Logger } from '@modules/logging';
import { PluginAction } from '@modules/openrct2/adapters';
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
import { 
  Flag,
  FlagManager
} from '@modules/utils';
import { wait } from '@modules/utils/runtime-utils';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

interface ProcessFlag extends Flag {
  'start': undefined;
  'start.defer': ScenarioFile;
  'screenshot': undefined;
  'save': undefined;
};

export declare interface OpenRCT2ServerController {

  /**
   * Adds the `listener` function to the end of the listeners array for the event named `eventName`.
   * @param event The name of the event.
   * @param listener The callback function.
   */
  on<E extends keyof OpenRCT2ServerControllerEvent>(
    event: E, listener: (args: ServerEventArgs<OpenRCT2ServerControllerEvent[E]>) => void
  ): this;

  /**
   * Synchronously calls each of the listeners registered for the event named `eventName`,
   * in the order they were registered, passing the supplied arguments to each.
   * @param eventName The name of the event being emitted.
   * @param args Event arguments to pass to all listeners.
   * @returns `true` if the event had listeners, `false` otherwise.
   */
  emit<E extends keyof OpenRCT2ServerControllerEvent>(
    eventName: E, args: ServerEventArgs<OpenRCT2ServerControllerEvent[E]>
  ): boolean;
};

/** 
 * Contains event names and their respective callback function definitions
 * for the `OpenRCT2ServerController` class.
 */
export interface OpenRCT2ServerControllerEvent {
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
  'server.scenario.complete': {
    scenarioFile: ScenarioFile | undefined,
    scenarioStatus: "completed" | "failed"
  };
  'server.start.defer': {
    scenarioFile: ScenarioFile,
    delayDuration: number
  };
  'server.start.defer.cancel': ScenarioFile;
};

export class OpenRCT2ServerController extends EventEmitter {
  private readonly logger: Logger;
  private readonly openRCT2ProcessEngine: OpenRCT2ProcessEngine;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerHostRepository;

  private readonly gameServers = new Map<number, OpenRCT2Server>();
  private readonly processFlags = new FlagManager<ProcessFlag>();

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

  isServerProcessActive(serverId: number, ...processNames: (keyof ProcessFlag)[]) {
    const flagValues = this.processFlags.getFlagsForId(serverId);
    if (processNames.length > 0) {
      return processNames.every(processName => flagValues.find(flagValue => flagValue[0] === processName) !== undefined);
    } else {
      return flagValues.length > 0;
    };
  };

  /**
   * 
   * @param serverId 
   * @param scenarioFile 
   */
  async startGameServerOnScenario(serverId: number, scenarioFile: ScenarioFile) {
    if (this.processFlags.trySetFlag(serverId, 'start')) {
      try {
        const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
        const deferredScenario = this.processFlags.getFlagValue(serverId, 'start.defer');
        if (deferredScenario) {
          this.processFlags.deleteFlag(serverId, 'start.defer');
          this.emit('server.start.defer.cancel', new ServerEventArgs(serverId, deferredScenario as ScenarioFile));
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
        this.processFlags.deleteFlag(serverId, 'start');
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param autosaveIndex 
   */
  async startGameServerOnAutosave(serverId: number, autosaveIndex = 0) {
    if (this.processFlags.trySetFlag(serverId, 'start')) {
      try {
        const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
        const deferredScenario = this.processFlags.getFlagValue(serverId, 'start.defer');
        if (deferredScenario) {
          this.processFlags.deleteFlag(serverId, 'start.defer');
          this.emit('server.start.defer.cancel', new ServerEventArgs(serverId, deferredScenario as ScenarioFile));
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
        this.processFlags.deleteFlag(serverId, 'start');
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param scenarioFile 
   */
  async startGameServerOnScenarioDeferred(serverId: number, scenarioFile: ScenarioFile) {
    if (this.processFlags.trySetFlag(serverId, 'start.defer', scenarioFile)) {
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const startupOptions = await serverDir.getStartupOptions();
      const now = Date.now();
      const startTime = now + (startupOptions.delayDuration * 60000);
      let remainingMinutes = startupOptions.delayDuration;
      let nextNoticeTime = now;

      await new Promise<void>(async resolve => {
        await this.logger.writeLog(`Server ${serverId} is on a deferred start launching ${scenarioFile.name}.`);
        while (Date.now() < startTime && this.processFlags.hasFlag(serverId, 'start.defer')) {
          if (Date.now() >= nextNoticeTime && nextNoticeTime < startTime) {
            this.emit(
              'server.start.defer',
              new ServerEventArgs(serverId, { scenarioFile: scenarioFile, delayDuration: remainingMinutes })
            );
            const gameServer = this.gameServers.get(serverId);
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
        if (this.processFlags.hasFlag(serverId, 'start.defer')) {
          this.processFlags.deleteFlag(serverId, 'start.defer');
          try {
            await this.startGameServerOnScenario(serverId, scenarioFile);
          } catch { };
        };
        resolve();
      });

      this.processFlags.deleteFlag(serverId, 'start.defer');
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
    const deferredScenario = this.processFlags.getFlagValue(serverId, 'start.defer');
    if (deferredScenario) {
      this.processFlags.deleteFlag(serverId, 'start.defer');
      this.emit('server.start.defer.cancel', new ServerEventArgs(serverId, deferredScenario as ScenarioFile));
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
   * @param timeoutMs
   * @returns 
   */
  async executePluginAction<A extends keyof PluginAction>(
    serverId: number,
    action: A,
    userId: string,
    args?: PluginAction[A],
    timeoutMs: number = 10000
  ) {
    const gameServer = this.gameServers.get(serverId);
    if (gameServer) {
      if (gameServer.pluginAdapter) {
        const result = await gameServer.pluginAdapter.executeAction(action, userId, args, timeoutMs);
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
    if (this.processFlags.trySetFlag(serverId, 'screenshot')) {
      const gameServer = this.gameServers.get(serverId);
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
  
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
            if (save) {
              result.screenshotFilePath = await this.openRCT2ProcessEngine.createScenarioScreenshot(
                save.saveFile,
                serverDir.getSubdirectoryPath(OpenRCT2ServerSubdirectoryName.Screenshot),
                `s${serverId}_screenshot`
              );
              result.scenarioFile = save.saveFile;
              result.scenarioName = save.scenarioName;
            } else {
              throw new Error('Failed to get a scenario save for a screenshot.');
            };
          } else {
            const screenshotFileName = await gameServer.pluginAdapter.executeAction('screenshot', userId, undefined, 1 * 60 * 1000);
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
        this.processFlags.deleteFlag(serverId, 'screenshot');
      };
    };
  };

  async createCurrentScenarioSave(serverId: number, userId: string) {
    if (this.processFlags.trySetFlag(serverId, 'save')) {
      const gameServer = this.gameServers.get(serverId);
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);

      try {
        if (gameServer && gameServer.pluginAdapter) {
          const saveFileName = await gameServer.pluginAdapter.executeAction('save', userId, undefined, 2 * 60 * 1000);
          await this.logger.writeLog(`Created a save file of Server ${serverId}.`);
          return {
            saveFile: await serverDir.getScenarioSaveByName(saveFileName.concat('.park')),
            scenarioName: await gameServer.getScenarioName(),
            usedPlugin: true
          };
        };
        const latestAutosave = await serverDir.getScenarioAutosave();
        const status = await serverDir.getStatus();
        const initiatedScenario = await this.scenarioRepo.getScenarioByName(status.initiatedScenarioFileName);
        await this.logger.writeLog(`Sharing latest autosave as the current save file for Server ${serverId}.`);
        return {
          saveFile: latestAutosave,
          scenarioName: initiatedScenario ? initiatedScenario.nameNoExtension : latestAutosave.nameNoExtension,
          usedPlugin: false
        };
      } catch (err) {
        await this.logger.writeError(err as Error);
        throw err;
      } finally {
        this.processFlags.deleteFlag(serverId, 'save');
      };
    };
  };

  private onServerClose(args: ServerEventArgs<{ code: number | null, signal: NodeJS.Signals | null }>) {
    const gameServer = this.gameServers.get(args.serverId);
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
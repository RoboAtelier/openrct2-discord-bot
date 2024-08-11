import { EventEmitter } from 'events';
import { Logger } from '@modules/logging';
import { ScenarioFile } from '@modules/openrct2/data/models';
import {
  ServerRepository,
  ScenarioRepository
} from '@modules/openrct2/data/repositories';
import { 
  OpenRCT2Server,
  ServerEventArgs
} from '@modules/openrct2/runtime';
import {
  GameService,
  PluginService
} from '@modules/openrct2/services'
import { 
  Flag,
  FlagManager
} from '@modules/utils';
import { wait } from '@modules/utils/runtime-utils';
import {
  createDateTimestamp,
  isStringNullOrWhiteSpace
} from '@modules/utils/string-utils';

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
    scenarioName?: string,
    scenarioStatus: "completed" | "failed",
    screenshot?: {
      screenshotFilePath: string,
      usedPlugin: boolean;
    },
    save?: {
      saveFilePath: string,
      saveFileName: string,
      usedPlugin: boolean;
    }
  };
  'server.start.defer': {
    scenarioFile: ScenarioFile,
    delayDuration: number
  };
  'server.start.defer.cancel': ScenarioFile;
};

export class OpenRCT2ServerController extends EventEmitter {
  private readonly logger: Logger;
  private readonly gameService: GameService;
  private readonly pluginService: PluginService;
  private readonly scenarioRepo: ScenarioRepository;
  private readonly serverHostRepo: ServerRepository;

  private readonly gameServers = new Map<number, OpenRCT2Server>();
  private readonly processFlags = new FlagManager<ProcessFlag>();

  constructor(
    logger: Logger,
    gameService: GameService,
    pluginService: PluginService,
    scenarioRepo: ScenarioRepository,
    serverHostRepo: ServerRepository
  ) {
    super();
    this.logger = logger;
    this.gameService = gameService;
    this.pluginService = pluginService;
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

  getGameServerStatus(serverId: number) {
    const gameServer = this.gameServers.get(serverId);
    if (gameServer) {
      return {
        scenarioName: gameServer.scenarioName,
        scenarioStatus: gameServer.scenarioStatus,
        isPaused: gameServer.isPaused
      };
    };
  };

  /**
   * 
   * @param serverId 
   * @param scenarioFile 
   */
  async startServer(serverId: number, scenarioFile?: ScenarioFile, autosaveIndex = 0) {
    if (this.processFlags.trySetFlag(serverId, 'start')) {
      try {
        const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
        const deferredScenario = this.processFlags.getFlagValue(serverId, 'start.defer');
        if (deferredScenario) {
          this.processFlags.deleteFlag(serverId, 'start.defer');
          this.emit('server.start.defer.cancel', new ServerEventArgs(serverId, deferredScenario as ScenarioFile));
        };
        if (this.gameServers.has(serverId)) {
          await this.stopServer(serverId, false);
        };
  
        const startupOptions = await serverDir.getStartupOptions();
        const pluginOptions = await serverDir.getPluginOptions();
        const status = await serverDir.getStatus();
        const targetScenarioFile = scenarioFile
          ? scenarioFile
          : await serverDir.getScenarioAutosave(autosaveIndex);
  
        if (scenarioFile) {
          if (!isStringNullOrWhiteSpace(status.currentScenarioFileName)) {
            status.previousScenarioFileName = `${status.currentScenarioFileName}`;
          };
          status.initiatedScenarioFileName = scenarioFile.name;
          status.currentScenarioFileName = scenarioFile.name;
          status.isCurrentScenarioCompleted = null;
        };
        status.lastStartupTime = new Date();
  
        await this.pluginService.syncServerPluginSettings(serverId);
        const gameServer = await this.gameService.createGameServerInstance(
          serverId,
          serverDir.path,
          targetScenarioFile,
          startupOptions,
          pluginOptions
        );
        this.gameServers.set(serverId, gameServer);
        this.captureServerEvents(gameServer);
        await serverDir.updateStatus(status);

        if (scenarioFile) {
          const metadata = await this.scenarioRepo.getScenarioMetadataForFile(scenarioFile);
          ++metadata.plays;
          await this.scenarioRepo.updateScenarioMetadata(metadata);
          this.emit('server.start', new ServerEventArgs(serverId, scenarioFile));
          await this.logger.writeLog(`Server ${serverId} was launched on ${scenarioFile.name}.`);
        } else {
          this.emit('server.restart', new ServerEventArgs(serverId, { autosaveIndex: autosaveIndex }));
          await this.logger.writeLog(`Server ${serverId} was launched on autosave ${targetScenarioFile.name}.`);
        };

        return true;
      } catch (err) {
        await this.logger.writeError(err as Error);
        throw err;
      } finally {
        this.processFlags.deleteFlag(serverId, 'start');
      };
    };
    return false;
  };

  /**
   * 
   * @param serverId 
   * @param scenarioFile 
   */
  async startServerDeferred(serverId: number, scenarioFile: ScenarioFile) {
    if (this.processFlags.trySetFlag(serverId, 'start.defer', scenarioFile)) {
      const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
      const startupOptions = await serverDir.getStartupOptions();
      const now = Date.now();
      const startTime = now + (startupOptions.delayDuration * 60000);
      let success = false;
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
                await gameServer.pluginAdapter.sendRequest('chat', `${serverId}`, alert);
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
            success = await this.startServer(serverId, scenarioFile);
          } catch { };
        };
        resolve();
      });

      this.processFlags.deleteFlag(serverId, 'start.defer');
      return success;
    };
    return false;
  };

  async startServerFromQueue(serverId: number, defer = false) {
    const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
    let queue = await serverDir.getQueue();

    if (queue.scenarios.length > 0) {
      const scenariosInQueue = await Promise.all(queue.scenarios.map(inQueue => {
        return this.scenarioRepo.getScenarioByName(inQueue);
      }));
      const validScenarios = scenariosInQueue.filter(inQueue => inQueue) as ScenarioFile[];
      queue.scenarios = validScenarios.map(scenarioFile => scenarioFile.name);

      const scenarioToRun = validScenarios[0];
      await this.logger.writeLog(`Server ${serverId} is starting a queued scenario ${scenarioToRun.name}.`);

      const success = defer
        ? await this.startServerDeferred(serverId, scenarioToRun)
        : await this.startServer(serverId, scenarioToRun);

      if (success) {
        const queueKey = await serverDir.lockFile('server-queue.json');
        queue = await serverDir.getQueue(queueKey);
        queue.scenarios = queue.scenarios.filter(inQueue => inQueue !== scenarioToRun.name);
        await serverDir.updateQueue(queue, queueKey);
        serverDir.unlockFile('server-queue.json', queueKey);
      };
      return success;
    };
    return false;
  };

  /**
   * 
   * @param serverId 
   * @param emitEvent 
   */
  async stopServer(serverId: number, emitEvent = true) {
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
      const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
      const status = await serverDir.getStatus();

      if (gameServer.currentScenarioFileName === gameServer.initiatedScenarioFile.name) {
        const metadata = await this.scenarioRepo.getScenarioMetadataByName(gameServer.currentScenarioFileName);
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
    const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
    const queueKey = await serverDir.lockFile('server-queue.json');
    const queue = await serverDir.getQueue(queueKey);

    if (queue.scenarios.length < queue.limit) {
      queue.scenarios.push(scenarioFile.name);
      await serverDir.updateQueue(queue, queueKey);
      await this.logger.writeLog(`Server ${serverId} queued up ${scenarioFile.name}.`);
      const status = await serverDir.getStatus();
      if (status.isCurrentScenarioCompleted) {
        this.startServerFromQueue(serverId, true);
      };
    };

    serverDir.unlockFile('server-queue.json', queueKey);
  };

  /**
   * 
   * @param serverId 
   * @param requestName 
   * @param userId 
   * @param args 
   * @param timeoutMs
   * @returns 
   */
  async executePluginRequest<R extends keyof OpenRCT2Module.AdapterRequest>(
    serverId: number,
    requestName: R,
    userId: string,
    args?: OpenRCT2Module.AdapterRequest[R],
    timeoutMs: number = 10000
  ) {
    const gameServer = this.gameServers.get(serverId);
    if (gameServer) {
      return await gameServer.executePluginRequest(requestName, userId, args, timeoutMs);
    };
    throw new Error(`Could not run plugin action. Server ${serverId} is not active.`);
  };

  /**
   * 
   * @param serverId 
   * @param userId 
   */
  async createServerScreenshot(serverId: number, userId: string): Promise<{
    screenshotFilePath: string,
    scenarioFile?: ScenarioFile,
    scenarioName: string,
    usedPlugin: boolean
  } | undefined> {
    if (this.processFlags.trySetFlag(serverId, 'screenshot')) {
      const gameServer = this.gameServers.get(serverId);
      const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
  
      try {  
        const startupOptions = await serverDir.getStartupOptions();
        if (gameServer && gameServer.pluginAdapter) {
          if (startupOptions.headless) {
            try {
              const save = await this.createCurrentScenarioSave(serverId, userId);
              if (save) {
                const result = {
                  screenshotFilePath: await this.gameService.createScenarioScreenshot(
                    save.saveFile,
                    serverDir.getSubdirectoryPath(OpenRCT2Module.ServerSubdirectoryName.Screenshot),
                    startupOptions.openRCT2ExecutablePath,
                    `s${serverId}_screenshot`
                  ),
                  scenarioFile: save.saveFile,
                  scenarioName: save.scenarioName,
                  usedPlugin: save.usedPlugin
                };
                await this.logger.writeLog(`Created a screenshot of Server ${serverId} from a generated save file.`);
                return result;
              };
            } catch (err) {
              await this.logger.writeError(err as Error);
            };
          };

          try {
            const screenshotFileName = await gameServer.pluginAdapter.sendRequest('screenshot', userId, undefined, 1 * 60 * 1000);
            const result = {
              screenshotFilePath: await serverDir.getScreenshotByName(screenshotFileName),
              scenarioName: gameServer.scenarioName,
              usedPlugin: true
            };
            await this.logger.writeLog(`Created a screenshot of Server ${serverId} at runtime.`);
            return result;
          } catch (err) {
            await this.logger.writeError(err as Error);
          };
        };

        const latestAutosave = await serverDir.getScenarioAutosave();
        const status = await serverDir.getStatus();
        const initiatedScenario = await this.scenarioRepo.getScenarioByName(status.initiatedScenarioFileName);
        const result = {
          screenshotFilePath: await this.gameService.createScenarioScreenshot(
            latestAutosave,
            serverDir.getSubdirectoryPath(OpenRCT2Module.ServerSubdirectoryName.Screenshot),
            startupOptions.openRCT2ExecutablePath,
            `s${serverId}_screenshot`
          ),
          scenarioFile: latestAutosave,
          scenarioName: initiatedScenario ? initiatedScenario.nameNoExtension : latestAutosave.nameNoExtension,
          usedPlugin: false
        };
        await this.logger.writeLog(`Created a screenshot of Server ${serverId} from an autosave.`);
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
      const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);

      try {
        if (gameServer && gameServer.pluginAdapter) {
          try {
            const saveFileName = await gameServer.pluginAdapter.sendRequest('save', userId, undefined, 2 * 60 * 1000);
            await this.logger.writeLog(`Created a save file of Server ${serverId}.`);
            return {
              saveFile: await serverDir.getScenarioSaveByName(saveFileName.concat('.park')),
              scenarioName: gameServer.scenarioName,
              usedPlugin: true
            };
          } catch (err) {
            await this.logger.writeError(err as Error);
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
    const serverDir = await this.serverHostRepo.getServerDirectoryById(args.serverId);
    const status = await serverDir.getStatus();

    const scenarioCompleted = args.data.scenarioStatus !== 'inProgress';
    if (
      status.currentScenarioFileName !== args.data.currentScenarioFileName
      || status.isCurrentScenarioCompleted !== scenarioCompleted
    ) {
      status.currentScenarioFileName = args.data.currentScenarioFileName;
      status.isCurrentScenarioCompleted = scenarioCompleted;
      await serverDir.updateStatus(status);
    };

    if (args.data.scenarioStatus !== 'inProgress') {
      
      // only count completions on uninterrupted runs
      const startupOptions = await serverDir.getStartupOptions();
      if (!/^autosave_\d{4}-\d{2}-\d{2}/.test(status.currentScenarioFileName)) {
        if (startupOptions.keepScore) {
          const metadata = await this.scenarioRepo.getScenarioMetadataByName(args.data.currentScenarioFileName);
          if (metadata) {
            args.data.scenarioStatus === 'completed' ? ++metadata.wins : ++metadata.losses;
            await this.scenarioRepo.updateScenarioMetadata(metadata);
          };
        };
      };

      const scenarioFile = await this.scenarioRepo.getScenarioByName(status.currentScenarioFileName);
      const eventData: {
        scenarioName?: string,
        scenarioStatus: "completed" | "failed",
        screenshot?: {
          screenshotFilePath: string,
          usedPlugin: boolean
        },
        save?: {
          saveFilePath: string,
          saveFileName: string,
          usedPlugin: boolean
        }
      } = {
        scenarioName: scenarioFile?.nameNoExtension,
        scenarioStatus: args.data.scenarioStatus
      };

      if (startupOptions.autoFinalize) {
        try {
          const screenshot = await this.createServerScreenshot(args.serverId, `${args.serverId}`);
          eventData.screenshot = screenshot;

          const save = screenshot && screenshot.scenarioFile
            ? { saveFile: screenshot.scenarioFile, scenarioName: screenshot.scenarioName, usedPlugin: screenshot.usedPlugin }
            : await this.createCurrentScenarioSave(args.serverId, `${args.serverId}`);
          if (save) {
            const finalSaveFileName = /^autosave_\d{4}-\d{2}-\d{2}/.test(save.saveFile.nameNoExtension)
              ? `final_${createDateTimestamp()}${save.saveFile.fileExtension}`
              : `${save.scenarioName}_final_${createDateTimestamp()}${save.saveFile.fileExtension}`;
            const serverDir = await this.serverHostRepo.getServerDirectoryById(args.serverId);
            await serverDir.addScenarioSaveFile(save.saveFile, finalSaveFileName);
            eventData.save = {
              saveFilePath: save.saveFile.path,
              saveFileName: finalSaveFileName,
              usedPlugin: save.usedPlugin
            };
          } else {
            eventData.save = { saveFilePath: '', saveFileName: '', usedPlugin: false };
          };

          eventData.scenarioName = save?.scenarioName ?? screenshot?.scenarioName ?? scenarioFile?.nameNoExtension;

          this.emit('server.scenario.complete', new ServerEventArgs(args.serverId, eventData));
        } catch (err) {
          await this.logger.writeError(err as Error);
          eventData.save = { saveFilePath: '', saveFileName: '', usedPlugin: false };
          this.emit('server.scenario.complete', new ServerEventArgs(args.serverId, eventData));
        };
      } else {
        this.emit('server.scenario.complete', new ServerEventArgs(args.serverId, eventData));
        this.startServerFromQueue(args.serverId, true);
      };
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
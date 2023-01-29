import path from 'path';
import { spawn } from 'child_process';
import { unlink } from 'fs/promises';
import { Socket } from 'net';
import { OpenRCT2Server } from '.';
import { Configuration } from '@modules/configuration';
import { Logger } from '@modules/logging';
import { OpenRCT2PluginAdapter } from '@modules/openrct2/adapters';
import { 
  PluginOptions,
  ScenarioFile,
  StartupOptions
} from '@modules/openrct2/data/models';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

/** Represents a class that handles running built-in processes using the OpenRCT2 application executable. */
export class OpenRCT2ProcessEngine {
  private static readonly exePathKey = 'openRCT2ExecutablePath';
  private static readonly processTimeoutMs = 30000;

  private readonly logger: Logger;
  private readonly openRCT2ExecutablePath: string;

  constructor(config: Configuration, logger: Logger) {
    this.logger = logger;
    const exePath = config.getValue<string>(OpenRCT2ProcessEngine.exePathKey);
    this.openRCT2ExecutablePath = path.resolve(exePath);
  };

  async initializeGameConfiguration(openRCT2DataPath: string, rct2GamePath: string) {
    const params = ['set-rct2', rct2GamePath, '--user-data-path', openRCT2DataPath];

    const setProcess = spawn(
      this.openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('RCT2 game data set process timed out.'));
      }, OpenRCT2ProcessEngine.processTimeoutMs);
      setProcess.on('exit', async (code, signal) => {
        clearTimeout(timeout);
        resolve({ code: code, signal: signal });
      });
      setProcess.on('error', err => {
        reject(err);
      });
      setProcess.stdout.on('data', data => {}); // flush output stream
    });
  };

  /**
   * 
   * @param serverId 
   * @param openRCT2DataPath 
   * @param scenarioFile 
   * @param startupOptions 
   * @param pluginOptions 
   * @returns 
   */
  async createGameServerInstance(
    serverId: number,
    openRCT2DataPath: string,
    scenarioFile: ScenarioFile,
    startupOptions: StartupOptions,
    pluginOptions: PluginOptions
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

    const gameInstance = spawn(
      this.openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    
    let launched = false;
    let adapterPlugin = !pluginOptions.useBotPlugins;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        gameInstance.kill('SIGKILL');
        reject(new Error('The game instance failed to start correctly.'))
      }, OpenRCT2ProcessEngine.processTimeoutMs);
      gameInstance.once('error', err => {
        reject(err);
      });
      gameInstance.stdout.on('data', (data: Buffer) => {
        const dataStr = data.toString('utf8');
        if (dataStr.includes(`istening for clients on *:${startupOptions.port}`)) {
          launched = true;
        } else if (dataStr.includes(`pter plugin for server ${serverId} is active`)) {
          adapterPlugin = true;
        };
        if (launched && adapterPlugin) {
          clearTimeout(timeout);
          gameInstance.stdout.removeAllListeners('data');
          gameInstance.removeAllListeners('error');
          resolve();
        };
      });
    });

    let pluginAdapter = null;
    if (pluginOptions.useBotPlugins) {
      const client = new Socket();
      client.connect(pluginOptions.adapterPluginPort, 'localhost');
      await new Promise<void>((resolve, reject) => {
        client.once('error', err => {
          reject(err);
        });
        client.once('connect', () => {
          client.removeAllListeners('error');
          resolve();
        });
      });
      pluginAdapter = new OpenRCT2PluginAdapter(client, this.logger);
    };

    return new OpenRCT2Server(serverId, gameInstance, scenarioFile, pluginAdapter);
  };

  /**
   * 
   * @param scenarioFile 
   * @param outputDirPath
   * @param screenshotName 
   */
  async createScenarioScreenshot(scenarioFile: ScenarioFile, outputDirPath: string, screenshotName = '') {
    const screenshotFilePath = isStringNullOrWhiteSpace(screenshotName)
      ? path.join(outputDirPath, `${scenarioFile.nameNoExtension}.png`)
      : path.join(outputDirPath, `${screenshotName}.png`);

    try {
      await unlink(screenshotFilePath);
    } catch { };

    const params = [
      'screenshot',
      scenarioFile.path,
      screenshotFilePath,
      'giant',
      '2', // zoom
      '0' // rotation
      // transparent by default
    ];

    const screenshotProcess = spawn(
      this.openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Screenshot generation timed out.'));
      }, OpenRCT2ProcessEngine.processTimeoutMs);
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
};
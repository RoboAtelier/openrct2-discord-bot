/// <reference path="../../../../plugins/messaging.d.ts" />

import path from 'path';
import { spawn } from 'child_process';
import { unlink } from 'fs/promises';
import { Socket } from 'net';
import { OpenRCT2Server } from '@modules/openrct2/runtime/index.js';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { MessagingPluginAdapter } from '@modules/openrct2/adapters/index.js';
import { 
  PluginOptions,
  ScenarioFile,
  StartupOptions
} from '@modules/openrct2/data/models/index.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

/** Represents a class that handles running built-in processes using the OpenRCT2 application executable. */
export class GameService {

  /**
   * 
   * @param openRCT2DataPath 
   * @param openRCT2ExecutablePath 
   * @param rct2GamePath 
   * @param timeoutMs 
   */
  async initializeGameConfiguration(
    openRCT2DataPath: string,
    openRCT2ExecutablePath: string,
    rct2GamePath: string,
    timeoutMs = 30 * 1000
  ) {
    const params = ['set-rct2', rct2GamePath, '--user-data-path', openRCT2DataPath];

    const setProcess = spawn(
      openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('RCT2 game data set process timed out.'));
      }, timeoutMs);
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
   * @param timeoutMs 
   * @returns 
   */
  async createGameServerInstance(
    serverId: number,
    openRCT2DataPath: string,
    scenarioFile: ScenarioFile,
    startupOptions: StartupOptions,
    pluginOptions: PluginOptions,
    timeoutMs = 60 * 1000
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
      startupOptions.openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    
    let launched = false;
    let pluginCheck = !pluginOptions.plugins.includes(OpenRCT2.PluginFileName.Messaging);
    await new Promise<void>((resolve, reject) => {
      const pluginName: MessagingPlugin.Name = 'Messaging Plugin';
      const timeout = setTimeout(() => {
        gameInstance.kill('SIGKILL');
        reject(new Error('The game instance failed to start correctly.'))
      }, timeoutMs);
      gameInstance.once('error', err => {
        reject(err);
      });
      gameInstance.stdout.on('data', (data: Buffer) => {
        const dataStr = data.toString('utf8');
        console.log(dataStr);
        if (dataStr.includes(`istening for clients on *:${startupOptions.port}`)) {
          launched = true;
        } else if (dataStr.includes(`${pluginName} for server ${serverId} is active`)) {
          pluginCheck = true;
        };
        if (launched && pluginCheck) {
          clearTimeout(timeout);
          gameInstance.stdout.removeAllListeners('data');
          gameInstance.removeAllListeners('error');
          resolve();
        };
      });
    });

    let pluginAdapter;
    if (pluginOptions.plugins.includes(OpenRCT2.PluginFileName.Messaging)) {
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
      pluginAdapter = new MessagingPluginAdapter(client);
    };

    return new OpenRCT2Server(serverId, gameInstance, scenarioFile, pluginAdapter);
  };

  /**
   * 
   * @param scenarioFile 
   * @param outputDirPath 
   * @param openRCT2ExecutablePath 
   * @param screenshotName 
   * @param timeoutMs 
   * @returns 
   */
  async createScenarioScreenshot(
    scenarioFile: ScenarioFile,
    outputDirPath: string,
    openRCT2ExecutablePath: string,
    screenshotName = '',
    timeoutMs = 60 * 1000
  ) {
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
      openRCT2ExecutablePath,
      params,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Screenshot generation timed out.'));
      }, timeoutMs);
      screenshotProcess.on('exit', (code, signal) => {
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
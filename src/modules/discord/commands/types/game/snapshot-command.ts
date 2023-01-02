import {
  bold,
  inlineCode,
  italic,
  underscore,
  ChatInputCommandInteraction,
  MessagePayload,
  RawFile,
  Snowflake
} from 'discord.js';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { ServerHostRepository } from '@modules/openrct2/data/repositories';
import { 
  createDateTimestamp,
  isStringNullOrWhiteSpace
} from '@modules/utils/string-utils';

type SnapshotCommandOptions = 'server-id' | 'finalize'

/** Represents a command for creating screenshots and save snapshots of OpenRCT2 game server scenarios. */
export class SnapshotCommand extends BotCommand<SnapshotCommandOptions, null, null> {
  private readonly botDataRepo: BotDataRepository;
  private readonly serverHostRepo: ServerHostRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    botDataRepo: BotDataRepository,
    serverHostRepository: ServerHostRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(CommandPermissionLevel.User);
    this.data
      .setName('snapshot')
      .setDescription('Creates a screenshot of a OpenRCT2 game server.')
      .addIntegerOption(option => 
        option
          .setName(this.reflectOptionName('server-id'))
          .setDescription('The id number of the server to snapshot.')
          .setMinValue(1)
      )
      .addBooleanOption(option => 
        option
          .setName(this.reflectOptionName('finalize'))
          .setDescription('Specifies to create both a screenshot and save file snapshot.')
      );

    this.botDataRepo = botDataRepo;
    this.openRCT2ServerController = openRCT2ServerController;
    this.serverHostRepo = serverHostRepository;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    let commandResponse = new CommandResponseBuilder();
    let attachments: RawFile[] = [];

    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)) {
      await interaction.reply(`Assign the ${italic('Scenario Channel')} with the ${inlineCode('/channel')} command first.`);
      return;
    };
    
    const serverId = this.doesInteractionHaveOption(interaction, 'server-id')
      ? this.getInteractionOption(interaction, 'server-id').value as number
      : 1;
    const finalize = this.doesInteractionHaveOption(interaction, 'finalize')
      ? this.getInteractionOption(interaction, 'finalize').value as boolean
      : false;
    if (this.openRCT2ServerController.isGameServerProcessRunning(serverId)) {
      commandResponse.appendToError(`${underscore(italic(`Server ${serverId}`))} is busy with another process.`);
    } else if (finalize && userLevel < CommandPermissionLevel.Trusted) {
      commandResponse.appendToError(this.formatOptionPermissionError('finalize'));
    } else {
      await interaction.deferReply();
      
      const screenshot = await this.createScreenshot(serverId, interaction.user.id);
      commandResponse = screenshot.commandResponse;
      if (screenshot.attachmentFile) {
        attachments.push(screenshot.attachmentFile);
      };
      
      if (finalize && screenshot.screenshot) {
        const finalSave = await this.createFinalizedSave(serverId, screenshot.screenshot.scenarioName);
        commandResponse = finalSave.commandResponse;
        if (finalSave.attachmentFile) {
          attachments.push(finalSave.attachmentFile);
        };
      };
    };

    if (commandResponse.hasError) {
      await interaction.editReply(commandResponse.error);
    } else {
      const messagePayload = new MessagePayload(interaction, { content: commandResponse.resolve() });
      messagePayload.files = attachments;

      if (finalize) {
        const snapshotMessage = await this.postServerScenarioSnapshot(interaction, messagePayload);
        if (snapshotMessage) {
          await interaction.editReply(snapshotMessage.url);
        } else {
          await interaction.editReply('Failed to post the snapshot.');
        };
      } else {
        await interaction.editReply(messagePayload);
      };
    };
  };

  private async createScreenshot(serverId: number, userId: Snowflake) {
    const commandResponse = new CommandResponseBuilder();
    let screenshotResult = undefined;
    let screenshotAttachment = undefined;

    try {
      screenshotResult = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      screenshotAttachment = await MessagePayload.resolveFile({
        attachment: screenshotResult.screenshotFilePath,
        name: `${screenshotResult.scenarioName}.png`,
      });
      commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(screenshotResult.scenarioName)} - Screenshot`);

      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const startupOptions = await serverDir.getStartupOptions();
      if (!this.openRCT2ServerController.getActiveGameServerById(serverId) || !startupOptions.useBotPlugins) {
        commandResponse.appendToMessage(`${bold('IMPORTANT')}: This screenshot may be outdated as it is based off of the most recent autosave.`);
      };
    } catch {
      commandResponse.appendToError(`Failed to capture a screenshot of ${underscore(italic(`Server ${serverId}`))}.`);
    };

    return { 
      screenshot: screenshotResult,
      attachmentFile: screenshotAttachment,
      commandResponse: commandResponse
    };
  };

  private async createFinalizedSave(serverId: number, scenarioName: string) {
    const commandResponse = new CommandResponseBuilder();
    let saveAttachment = undefined;

    try {
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const latestAutosave = await serverDir.getScenarioAutosave();
      const finalSaveFileName = `${scenarioName}_${createDateTimestamp()}${latestAutosave.fileExtension}`;
      await serverDir.addFileExclusive(
        latestAutosave.path,
        finalSaveFileName,
        'save'
      );
      saveAttachment = await MessagePayload.resolveFile({
        attachment: latestAutosave.path,
        name: `s${serverId}_${finalSaveFileName}`,
      });
      commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(scenarioName)} - Snapshot`);
      
      const startupOptions = await serverDir.getStartupOptions();
      commandResponse.appendToMessage(
        `${bold('IMPORTANT')}: The finalized file ${
          !this.openRCT2ServerController.getActiveGameServerById(serverId) || !startupOptions.useBotPlugins
            ? 'and screenshot may be outdated as they are'
            : 'may be outdated as it is'
        } based off of the most recent autosave.`
      );
    } catch {
      commandResponse.appendToError(`Failed to finalize a save file of ${underscore(italic(`Server ${serverId}`))}.`);
    };

    return {
      attachmentFile: saveAttachment,
      commandResponse: commandResponse
    };
  };

  /**
   * Posts a message with the snapshot files.
   * @param messagePayload
   */
  private async postServerScenarioSnapshot(interaction: ChatInputCommandInteraction, messagePayload: MessagePayload) {
    try {
      const guildInfo = await this.botDataRepo.getGuildInfo();
      const channel = await interaction.guild?.channels.fetch(guildInfo.scenarioChannelId);
      if (channel && channel.isTextBased()) {
        return await channel.send(messagePayload);
      };
      throw new Error('Could not post scenario snapshot to a text channel.');
    } catch (err) {
      // logging
    };
  };
};
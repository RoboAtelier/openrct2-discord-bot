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
    let attachments: {
      screenshot: RawFile | null,
      finalizedSave: RawFile | null
    } = { screenshot: null, finalizedSave: null };

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
      const result = await this.createServerSnapshot(interaction, serverId, finalize);
      commandResponse = result.commandResponse;
      attachments = result.attachments;
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    if (commandResponse.hasError) {
      await interaction.editReply(commandResponse.error);
    } else {
      const messagePayload = new MessagePayload(interaction, { content: commandResponse.resolve() });
      messagePayload.files = attachments.screenshot ? [attachments.screenshot] : [];

      if (attachments.finalizedSave) {
        messagePayload.files.push(attachments.finalizedSave);
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

  private async createServerSnapshot(
    interaction: ChatInputCommandInteraction,
    serverId: number,
    finalize: boolean
  ) {
    let commandResponse = new CommandResponseBuilder();
    let attachments: { 
      screenshot: RawFile | null,
      finalizedSave: RawFile | null
    } = { screenshot: null, finalizedSave: null };

    const screenshotResult = await this.createScreenshot(serverId, interaction.user.id);
    commandResponse = screenshotResult.commandResponse;
    if (screenshotResult.attachmentFile) {
      attachments.screenshot = screenshotResult.attachmentFile;
    };
    
    if (finalize) {
      const finalSave = await this.createFinalizedSave(serverId, screenshotResult);
      if (finalSave.attachmentFile) {
        commandResponse = finalSave.commandResponse;
        attachments.finalizedSave = finalSave.attachmentFile;
      } else {
        commandResponse.appendToMessage(italic('Save file could not generated.'));
      };
    };

    return {
      commandResponse: commandResponse,
      attachments: attachments
    };
  };

  private async createScreenshot(serverId: number, userId: Snowflake) {
    const commandResponse = new CommandResponseBuilder();
    let screenshot = null;
    let screenshotAttachment = null;

    try {
      screenshot = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      screenshotAttachment = await MessagePayload.resolveFile({
        attachment: screenshot.screenshotFilePath,
        name: `${screenshot.scenarioName}.png`,
      });
      commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(screenshot.scenarioName)} - Screenshot`);

      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const startupOptions = await serverDir.getStartupOptions();
      if (!this.openRCT2ServerController.getActiveGameServerById(serverId) || !startupOptions.useBotPlugins) {
        commandResponse.appendToMessage(`${
          bold('IMPORTANT')
        }: This screenshot may be inaccurate as it is based off of the most recent autosave, not the current scenario state.`);
      };
    } catch {
      commandResponse.appendToError(`Failed to capture a screenshot of ${underscore(italic(`Server ${serverId}`))}.`);
    };

    return { 
      screenshot: screenshot,
      attachmentFile: screenshotAttachment,
      commandResponse: commandResponse
    };
  };

  private async createFinalizedSave(
    serverId: number,
    screenshotResult: {
      screenshot: {
        screenshotFilePath: string;
        scenarioName: string;
      } | null;
      attachmentFile: RawFile | null;
    }
  ) {
    const commandResponse = new CommandResponseBuilder();
    let saveAttachment = null;

    try {
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      const latestAutosave = await serverDir.getScenarioAutosave();
      const finalScenarioName = screenshotResult.screenshot ? screenshotResult.screenshot.scenarioName : `scenario`;
      const finalSaveFileName = `${finalScenarioName}_final_${createDateTimestamp()}${latestAutosave.fileExtension}`;
      await serverDir.addFileExclusive(
        latestAutosave.path,
        finalSaveFileName,
        'save'
      );
      saveAttachment = await MessagePayload.resolveFile({
        attachment: latestAutosave.path,
        name: `s${serverId}_${finalSaveFileName}`,
      });
      commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(finalScenarioName)} - Snapshot`);
      
      const startupOptions = await serverDir.getStartupOptions();
      commandResponse.appendToMessage(
        `${bold('IMPORTANT')}: The finalized file ${
          (
            !this.openRCT2ServerController.getActiveGameServerById(serverId)
            || !startupOptions.useBotPlugins
          ) && screenshotResult.attachmentFile
            ? 'and screenshot may be inaccurate as they are'
            : 'may be inaccurate as it is'
        } based off of the most recent autosave, not the current scenario state.`
      );

      if (!screenshotResult.attachmentFile) {
        commandResponse.appendToMessage(italic('Screenshot could not be generated.'));
      };
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
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
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { ServerHostRepository } from '@modules/openrct2/data/repositories';
import { ScenarioFile } from '@modules/openrct2/data/models';
import { 
  createDateTimestamp,
  isStringNullOrWhiteSpace
} from '@modules/utils/string-utils';

type SnapshotCommandOptions = 'server-id' | 'finalize'

/** Represents a command for creating screenshots and save snapshots of OpenRCT2 game server scenarios. */
export class SnapshotCommand extends BotCommand<SnapshotCommandOptions, null, null> {
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly serverHostRepo: ServerHostRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    logger: Logger,
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

    this.logger = logger;
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
      const result = await this.createServerSnapshot(serverId, interaction.user.id, finalize);
      commandResponse = result.commandResponse;
      attachments = result.attachments;
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    if (commandResponse.hasError) {
      if (interaction.deferred) {
        await interaction.editReply(commandResponse.resolve());
      } else {
        await interaction.reply(commandResponse.resolve());
      };
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
    serverId: number,
    userId: Snowflake,
    finalize: boolean
  ) {
    const commandResponse = new CommandResponseBuilder();
    let attachments: { 
      screenshot: RawFile | null,
      finalizedSave: RawFile | null
    } = { screenshot: null, finalizedSave: null };

    const screenshotResult = await this.createScreenshot(serverId, userId);
    if (screenshotResult) {
      attachments.screenshot = screenshotResult.attachmentFile;
      commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(screenshotResult.screenshot.scenarioName)} - Screenshot`);
      if (!screenshotResult.screenshot.usedPlugin) {
        commandResponse.appendToMessage(`${bold('IMPORTANT')}: This screenshot may be inaccurate as it is based off of the most recent autosave.`);
      };
    } else {
      commandResponse.appendToError(`Failed to capture a screenshot of ${underscore(italic(`Server ${serverId}`))}.`);
    };
    
    if (finalize) {
      const saveResult = screenshotResult
        ? await this.createFinalizedSave(
            serverId,
            userId,
            screenshotResult.screenshot.scenarioFile,
            screenshotResult.screenshot.scenarioName
          )
        : await this.createFinalizedSave(serverId, userId);
      if (saveResult) {
        attachments.finalizedSave = saveResult.attachmentFile;

        commandResponse.reset();
        commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(saveResult.scenarioName)} - Snapshot`);
        if (screenshotResult) {
          if (!screenshotResult.screenshot.usedPlugin) {
            commandResponse.appendToMessage(`${bold('IMPORTANT')}: This snapshot may be outdated as it is based off of the most recent autosave.`);
          };
        } else {
          commandResponse.appendToMessage(italic('Screenshot could not be generated.'));
        };
      } else {
        commandResponse.appendToError(`Failed to finalize a save file of ${underscore(italic(`Server ${serverId}`))}.`);
      };
    };

    return {
      commandResponse: commandResponse,
      attachments: attachments
    };
  };

  private async createScreenshot(serverId: number, userId: Snowflake) {
    try {
      const screenshot = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      const screenshotAttachment = await MessagePayload.resolveFile({
        attachment: screenshot.screenshotFilePath,
        name: `${screenshot.scenarioName}.png`,
      });
      return { 
        screenshot: screenshot,
        attachmentFile: screenshotAttachment,
      };
    } catch {
      return null;
    };
  };

  private async createFinalizedSave(
    serverId: number,
    userId: Snowflake,
    existingScenarioFile?: ScenarioFile,
    scenarioName?: string
  ) {
    try {
      let scenarioSaveFile = existingScenarioFile;
      let saveFileScenarioName = scenarioName;
      if (!scenarioSaveFile) {
        const save = await this.openRCT2ServerController.createCurrentScenarioSave(serverId, userId);
        scenarioSaveFile = save.saveFile;
        saveFileScenarioName = save.scenarioName;
      };

      const finalSaveFileName = `${saveFileScenarioName}_final_${createDateTimestamp()}${scenarioSaveFile.fileExtension}`;
      const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
      await serverDir.addScenarioSaveFile(scenarioSaveFile, finalSaveFileName);
      const saveAttachment = await MessagePayload.resolveFile({
        attachment: scenarioSaveFile.path,
        name: `s${serverId}_${finalSaveFileName}`,
      });
      return {
        scenarioName: saveFileScenarioName!,
        attachmentFile: saveAttachment
      };
    } catch {
      return null;
    };
  };

  /**
   * Posts a message with the snapshot files.
   * @async
   * @param interaction
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
      await this.logger.writeError(err as Error);
    };
  };
};
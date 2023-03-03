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
import { 
  createDateTimestamp,
  isStringNullOrWhiteSpace
} from '@modules/utils/string-utils';
import { wait } from '@modules/utils/runtime-utils';

type SnapshotCommandOptions = 'server-id'
type SnapshotSubcommands = 'screenshot' | 'finalize'

/** Represents a command for creating screenshots and save snapshots of OpenRCT2 game server scenarios. */
export class SnapshotCommand extends BotCommand<SnapshotCommandOptions, SnapshotSubcommands, null> {
  private static readonly byteSizeLimit = 8 * 1024 * 1024;

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
      .setDescription('Creates snapshots of a OpenRCT2 game server.')
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('screenshot'))
          .setDescription('Captures a screenshot of a OpenRCT2 game server.')
          .addIntegerOption(option => 
            option
              .setName(this.reflectOptionName('server-id'))
              .setDescription('The id number of the server to screenshot.')
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('finalize'))
          .setDescription('Finalizes the current state of a OpenRCT2 game server.')
          .addIntegerOption(option => 
            option
              .setName(this.reflectOptionName('server-id'))
              .setDescription('The id number of the server to finalize.')
              .setMinValue(1)
          )
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
      screenshot?: RawFile,
      finalizedSave?: RawFile
    } = {};

    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)) {
      await interaction.reply(`Assign the ${italic('Scenario Channel')} with the ${inlineCode('/channel')} command first.`);
      return;
    };
    
    const serverId = this.doesInteractionHaveOption(interaction, 'server-id')
      ? this.getInteractionOption(interaction, 'server-id').value as number
      : 1;
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'save', 'screenshot')) {
      commandResponse.appendToError(`${underscore(italic(`Server ${serverId}`))} is busy with another process.`);
    } else {
      await interaction.deferReply();

      if (this.isInteractionUsingSubcommand(interaction, 'screenshot')) {
        const result = await this.createScreenshot(serverId, interaction.user.id);
        if (result.attachment) {
          attachments.screenshot = result.attachment;
        };
        commandResponse = result.response;
      } else if (this.isInteractionUsingSubcommand(interaction, 'finalize')) {
        if (userLevel > CommandPermissionLevel.User) {
          const result = await this.createFinalizedSave(serverId, interaction.user.id);
          if (result.attachments) {
            attachments = result.attachments;
          };
          commandResponse = result.response;
        } else {
          commandResponse.appendToError(this.formatSubcommandPermissionError(null, 'finalize'));
        };
      };
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
      const attachmentFiles = [];
      for (const attachment of Object.values(attachments)) {
        if (attachment) {
          attachmentFiles.push(attachment);
        };
      };
      if (attachments.finalizedSave) {
        const snapshotMessage = await this.postServerScenarioSnapshot(interaction, commandResponse, attachmentFiles);
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

    try {
      const screenshot = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      if (screenshot) {
        const screenshotAttachment = await MessagePayload.resolveFile({
          attachment: screenshot.screenshotFilePath,
          name: `${screenshot.scenarioName}.png`,
        });
        if ((screenshotAttachment.data as Buffer).length > SnapshotCommand.byteSizeLimit) {
          commandResponse.appendToMessage('The screenshot file is too large to be posted.');
        } else {
          commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(screenshot.scenarioName)} - Screenshot`);
          if (!screenshot.usedPlugin) {
            commandResponse.appendToMessage(`${bold('NOTE')}: This screenshot may be inaccurate as it is based off of the most recent autosave.`);
          };
        };
        return { 
          attachment: screenshotAttachment,
          response: commandResponse
        };
      };
    } catch { };

    commandResponse.appendToError(`Failed to capture a screenshot of ${underscore(italic(`Server ${serverId}`))}.`);
    return { response: commandResponse };
  };

  private async createFinalizedSave(serverId: number, userId: Snowflake) {
    const commandResponse = new CommandResponseBuilder();
    const attachments: {
      screenshot?: RawFile,
      finalizedSave?: RawFile
    } = {};

    try {
      let scenarioName = '';
      const screenshot = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      if (screenshot) {
        scenarioName = screenshot.scenarioName;
        const screenshotAttachment = await MessagePayload.resolveFile({
          attachment: screenshot.screenshotFilePath,
          name: `${screenshot.scenarioName}.png`,
        });
        attachments.screenshot = screenshotAttachment;
      };

      const save = screenshot && screenshot.scenarioFile
        ? { saveFile: screenshot.scenarioFile, scenarioName: screenshot.scenarioName, usedPlugin: screenshot.usedPlugin }
        : await this.openRCT2ServerController.createCurrentScenarioSave(serverId, userId);
      if (save) {
        scenarioName = save.scenarioName;
        const finalSaveFileName = /^autosave_\d{4}-\d{2}-\d{2}/.test(save.saveFile.nameNoExtension)
          ? `final_${createDateTimestamp()}${save.saveFile.fileExtension}`
          : `${save.scenarioName}_final_${createDateTimestamp()}${save.saveFile.fileExtension}`;
        const serverDir = await this.serverHostRepo.getOpenRCT2ServerDirectoryById(serverId);
        await serverDir.addScenarioSaveFile(save.saveFile, finalSaveFileName);
        const saveAttachment = await MessagePayload.resolveFile({
          attachment: save.saveFile.path,
          name: `s${serverId}_${finalSaveFileName}`,
        });
        attachments.finalizedSave = saveAttachment;
      };

      if (scenarioName.length > 0) {
        commandResponse.appendToMessage(`${underscore(italic(`Server ${serverId}`))} - ${bold(scenarioName)} - Snapshot`);
        if (screenshot && attachments.screenshot) {
          if ((attachments.screenshot.data as Buffer).length > SnapshotCommand.byteSizeLimit) {
            commandResponse.appendToMessage('The screenshot file is too large to be posted.');
            attachments.screenshot = undefined;
          } else {
            if (!screenshot.usedPlugin) {
              commandResponse.appendToMessage(`${bold('NOTE')}: This screenshot may be inaccurate as it is based off of the most recent autosave.`);
            };
          };
        };
        if (save && attachments.finalizedSave) {
          if ((attachments.finalizedSave.data as Buffer).length > SnapshotCommand.byteSizeLimit) {
            commandResponse.appendToMessage('The finalized save file is too large to be posted.');
            attachments.finalizedSave = undefined;
          } else {
            if (!save.usedPlugin) {
              commandResponse.appendToMessage(`${bold('NOTE')}: This save file may be out of date as it is based off of the most recent autosave.`);
            };
          };
        };

        return {
          attachments: attachments,
          response: commandResponse
        };
      };
    } catch { };

    commandResponse.appendToError(`Failed to finalize a save file for ${underscore(italic(`Server ${serverId}`))}.`);
    return { response: commandResponse };
  };

  /**
   * Posts a message with the snapshot files.
   * @async
   * @param interaction
   * @param messagePayload
   */
  private async postServerScenarioSnapshot(
    interaction: ChatInputCommandInteraction,
    response: CommandResponseBuilder,
    attachmentFiles: RawFile[]
  ) {
    try {
      const guildInfo = await this.botDataRepo.getGuildInfo();
      const channel = await interaction.guild?.channels.fetch(guildInfo.scenarioChannelId);
      if (channel && channel.isTextBased()) {
        let totalSize = 0;
        for (const attachmentFile of attachmentFiles) {
          totalSize += (attachmentFile.data as Buffer).length;
        };
        if (totalSize > SnapshotCommand.byteSizeLimit) {
          const messagePayload = new MessagePayload(interaction, { content: response.resolve() });
          messagePayload.files = attachmentFiles.slice(0, 1);
          const firstMessage = await channel.send(messagePayload);
          for (const attachmentFile of attachmentFiles.slice(1)) {
            await wait(1, 's');
            await channel.send({ files: [{ attachment: attachmentFile.data as Buffer, name: attachmentFile.name }] });
          };
          return firstMessage;
        } else {
          const messagePayload = new MessagePayload(interaction, { content: response.resolve() });
          messagePayload.files = attachmentFiles;
          return await channel.send(messagePayload);
        };
      };
      throw new Error('Could not post scenario snapshot to a text channel.');
    } catch (err) {
      await this.logger.writeError(err as Error);
    };
  };
};
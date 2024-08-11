import {
  bold,
  inlineCode,
  italic,
  underscore,
  ChatInputCommandInteraction,
  MessagePayload,
  Snowflake,
  TextBasedChannel
} from 'discord.js';
import { 
  fileByteSizeLimit,
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { ServerRepository } from '@modules/openrct2/data/repositories';
import { 
  createDateTimestamp,
  isStringNullOrWhiteSpace
} from '@modules/utils/string-utils';
import { wait } from '@modules/utils/runtime-utils';

const SnapshotSubcommands = <const>[
  {
    name: 'screenshot',
    description: 'Creates snapshots of a OpenRCT2 game server.',
    permissionLevel: CommandPermissionLevel.User,
    options: [
      {
        name: 'server-id',
        type: 'integer',
        description: 'The id number of the server to screenshot.',
        minValue: 1
      }
    ]
  },
  {
    name: 'finalize',
    description: 'Finalizes the current state of a OpenRCT2 game server.',
    options: [
      {
        name: 'server-id',
        type: 'integer',
        description: 'The id number of the server to finalize.',
        minValue: 1
      }
    ]
  }
];

/** Represents a command for creating screenshots and save snapshots of OpenRCT2 game server scenarios. */
export class SnapshotCommand extends SubcommandsDiscordBotCommand<undefined, typeof SnapshotSubcommands[number]> {
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly serverRepo: ServerRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    logger: Logger,
    botDataRepo: BotDataRepository,
    serverRepo: ServerRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    super(
      'snapshot',
      'Creates snapshots of a OpenRCT2 game server.',
      undefined,
      SnapshotSubcommands,
      CommandPermissionLevel.Trusted
    );

    this.logger = logger;
    this.botDataRepo = botDataRepo;
    this.serverRepo = serverRepo;
    this.openRCT2ServerController = openRCT2ServerController;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)) {
      await interaction.reply(`Assign the ${italic('Scenario Channel')} with the ${inlineCode('/channel')} command first.`);
      return;
    };

    const serverId = this.getInteractionOption(interaction, 'server-id')?.value as number ?? 1;
    if (this.openRCT2ServerController.isServerProcessActive(serverId, 'save', 'screenshot')) {
      await interaction.reply(`${underscore(italic(`Server ${serverId}`))} is busy with another process.`);
      return;
    };

    await interaction.deferReply();
    if (subcommandName === 'screenshot') {
      await this.createScreenshot(response, serverId, interaction.user.id);
    } else if (subcommandName === 'finalize') {
      await this.createFinalizedSave(response, serverId, interaction.user.id);
    };

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      return;
    };

    if (subcommandName === 'finalize') {
      const snapshotMessage = await this.postServerScenarioSnapshot(response, interaction);
      if (snapshotMessage) {
        if (snapshotMessage.channelId != interaction.channelId) {
          await interaction.editReply(snapshotMessage.url);
        } else {
          await interaction.editReply('Complete.');
        };
      } else {
        await interaction.editReply('Failed to post the snapshot. No save file was successfully generated.');
      };
    } else {
      const messagePayload = response.resolve(interaction);
      await interaction.editReply(messagePayload);
    };
  };

  private async createScreenshot(response: ResponseBuilder, serverId: number, userId: Snowflake) {
    try {
      const screenshot = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      if (screenshot) {
        const screenshotFilePayload = {
          attachment: screenshot.screenshotFilePath,
          name: `${screenshot.scenarioName}.png`,
        };
        const screenshotAttachment = await MessagePayload.resolveFile(screenshotFilePayload);
        if ((screenshotAttachment.data as Buffer).length > fileByteSizeLimit) {
          response.addText('The screenshot file is too large to be posted.');
        } else {
          response.addText(`${underscore(italic(`Server ${serverId}`))} - ${
            /^autosave_\d{4}-\d{2}-\d{2}/.test(screenshot.scenarioName) ? bold('Scenario') : bold(screenshot.scenarioName)
          } - Screenshot`);
          if (!screenshot.usedPlugin) {
            response.addText(`${bold('NOTE')}: This screenshot may be inaccurate as it is based off of the most recent autosave.`);
          };
          response.addFiles(screenshotFilePayload);
        };
      };
    } catch {
      response.addErrorText(`Failed to capture a screenshot of ${underscore(italic(`Server ${serverId}`))}.`);
    };
  };

  private async createFinalizedSave(response: ResponseBuilder, serverId: number, userId: Snowflake) {
    try {
      const screenshot = await this.openRCT2ServerController.createServerScreenshot(serverId, userId);
      const save = screenshot && screenshot.scenarioFile
        ? { saveFile: screenshot.scenarioFile, scenarioName: screenshot.scenarioName, usedPlugin: screenshot.usedPlugin }
        : await this.openRCT2ServerController.createCurrentScenarioSave(serverId, userId);

      if (save) {
        const noteSegments = [];
        response.addText(`${underscore(italic(`Server ${serverId}`))} - ${
          /^autosave_\d{4}-\d{2}-\d{2}/.test(save.scenarioName) ? bold('Scenario') : bold(save.scenarioName)
        } - Snapshot`);

        if (screenshot) {
          const screenshotFilePayload = {
            attachment: screenshot.screenshotFilePath,
            name: `${screenshot.scenarioName}.png`,
          };
          const screenshotAttachment = await MessagePayload.resolveFile(screenshotFilePayload);
          if ((screenshotAttachment.data as Buffer).length > fileByteSizeLimit) {
            response.addText('Could not post screenshot as the file size is too big.');
          } else {
            if (!screenshot.usedPlugin) {
              noteSegments.push('This screenshot may be inaccurate as it is based off of the most recent autosave.');
            };
            response.addFiles(screenshotFilePayload);
          };
        };

        const finalSaveFileName = /^autosave_\d{4}-\d{2}-\d{2}/.test(save.saveFile.nameNoExtension)
          ? `final_${createDateTimestamp()}${save.saveFile.fileExtension}`
          : `${save.scenarioName}_final_${createDateTimestamp()}${save.saveFile.fileExtension}`;
        const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
        await serverDir.addScenarioSaveFile(save.saveFile, finalSaveFileName);
        const saveFilePayload = {
          attachment: save.saveFile.path,
          name: `s${serverId}_${finalSaveFileName}`,
        };
        const saveAttachment = await MessagePayload.resolveFile(saveFilePayload);

        if ((saveAttachment.data as Buffer).length > fileByteSizeLimit) {
          try {
            const serverDir = await this.serverRepo.getServerDirectoryById(serverId);
            const latestAutosave = await serverDir.getScenarioAutosave();
            const autosaveFilePayload = {
              attachment: latestAutosave.path,
              name: `s${serverId}_final_${createDateTimestamp()}${latestAutosave.fileExtension}`,
            };
            const autosaveAttachment = await MessagePayload.resolveFile(autosaveFilePayload);
            if ((autosaveAttachment.data as Buffer).length > fileByteSizeLimit) {
              response.addText('Could not post the finalized save file as the file size is too big.');
            } else {
              response.addFiles(autosaveFilePayload);
              noteSegments.push('This save file is from the most recent autosave and could be outdated.');
              noteSegments.push('The original finalized save file size was too big to post.');
            };
          } catch {
            response.addText('Could not post the finalized save file as the file size is too big.');
          };
        } else {
          if (!save.usedPlugin) {
            noteSegments.push('This save file is from the most recent autosave and could be outdated.');
          };
          response.addFiles(saveFilePayload);
        };

        if (noteSegments.length > 0) {
          response.addText(`${bold('NOTE')}: ${noteSegments.join(' ')}`);
        };
      };
    } catch {
      response.addErrorText(`Failed to finalize a save file for ${underscore(italic(`Server ${serverId}`))}.`);
    };
  };

  /**
   * Posts a message with the snapshot files.
   * @async
   * @param interaction
   */
  private async postServerScenarioSnapshot(
    response: ResponseBuilder,
    interaction: ChatInputCommandInteraction
  ) {
    try {
      const guildInfo = await this.botDataRepo.getGuildInfo();
      const channel = await interaction.guild?.channels.fetch(guildInfo.scenarioChannelId);

      let totalSize = 0;
      if (channel && channel.isTextBased()) {
        const targetPayload = await response.resolve(channel).resolveFiles();
        for (const attachmentFile of targetPayload.files ?? []) {
          totalSize += (attachmentFile.data as Buffer).length;
        };
        if (totalSize > fileByteSizeLimit) { // should have 2 files here
          const secondFile = targetPayload.files?.pop()!;
          const firstMessage = await channel.send(targetPayload);
          await wait(1, 's');
          await channel.send({ files: [{ attachment: secondFile.data as Buffer, name: secondFile.name }] });
          return firstMessage;
        } else if (totalSize) {
          return await channel.send(targetPayload);
        };
      } else {
        response.addTextToStart('Invalid scenario channel id was specified.');
        const targetPayload = await response.resolve(interaction).resolveFiles();
        for (const attachmentFile of targetPayload.files ?? []) {
          totalSize += (attachmentFile.data as Buffer).length;
        };
        if (totalSize > fileByteSizeLimit) {
          const initialChannel = await interaction.guild?.channels.fetch(interaction.channelId) as TextBasedChannel;
          const secondFile = targetPayload.files?.pop()!;
          const firstMessage = await interaction.editReply(targetPayload);
          await wait(1, 's');
          await initialChannel.send({ files: [{ attachment: secondFile.data as Buffer, name: secondFile.name }] });
          return firstMessage;
        } else if (totalSize) {
          return await interaction.editReply(targetPayload);
        };
      };
    } catch (err) {
      console.log(err);
      await this.logger.writeError(err as Error);
    };
  };
};
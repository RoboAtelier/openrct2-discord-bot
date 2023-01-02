import { EOL } from 'os';
import {
  inlineCode,
  italic,
  underscore,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
  MessagePayload
} from 'discord.js';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

type SlashCommand = {
  name: string,
  description: string,
  options: Option[] | undefined,
  subcommandGroups: Map<string, SubcommandGroup> | undefined
}
type Option = {
  name: string,
  description: string,
  type: number
};
type Subcommand = {
  name: string,
  description: string,
  options: Option[]
};
type SubcommandGroup = {
  name: string,
  description: string,
  subcommands: Map<string, Subcommand>
};

type HelpCommandOptions = 'command' | 'group' | 'subcommand'

/** Represents a command for information on bot commands. */
export class HelpCommand extends BotCommand<HelpCommandOptions, null, null> {
  private readonly slashCommands = new Map<string, SlashCommand>();

  constructor(commandData: SlashCommandBuilder[]) {
    super(CommandPermissionLevel.User);
    this.data
      .setName('help')
      .setDescription('Provides command information for this bot.')
      .addStringOption(option =>
        option
          .setName(this.reflectOptionName('command'))
          .setDescription('The name of the command to get help for.')
          .setChoices(...commandData.map(data => { 
            return { name: data.name, value: data.name };
          }))
      )
      .addStringOption(option =>
        option
          .setName(this.reflectOptionName('group'))
          .setDescription('The name of the subcommand group.')
      )
      .addStringOption(option =>
        option
          .setName(this.reflectOptionName('subcommand'))
          .setDescription('The name of the subcommand.')
      );

    for (const data of commandData) {
      const slashCommand: SlashCommand = {
        name: data.name,
        description: data.description,
        options: undefined,
        subcommandGroups: undefined
      };
      if (data.options.length > 0) {
        const optionCheck = data.options[0] as any;
        if (optionCheck.options !== undefined) {
          slashCommand.subcommandGroups = new Map<string, SubcommandGroup>();
          const subcommands = new Map<string, Subcommand>();
          for (const subcommandOrGroup of data.options as any[]) {
            if (0 === subcommandOrGroup.options.length || subcommandOrGroup.options[0].type !== undefined) { // subcommand
              const subcommand: Subcommand = { name: subcommandOrGroup.name, description: subcommandOrGroup.description, options: [] };
              subcommand.options = subcommandOrGroup.options.map((option: any) => {
                return { name: option.name, description: option.description, type: option.type };
              });
              subcommands.set(subcommand.name, subcommand);
            } else { // group
              const group: SubcommandGroup = { 
                name: subcommandOrGroup.name,
                description: subcommandOrGroup.description,
                subcommands: new Map<string, Subcommand>()
              };
              for (const subcommand of subcommandOrGroup.options) {
                const groupSubcommand: Subcommand = { name: subcommand.name, description: subcommand.description, options: [] };
                groupSubcommand.options = subcommand.options.map((option: any) => {
                  return { name: option.name, description: option.description, type: option.type };
                });
                group.subcommands.set(groupSubcommand.name, groupSubcommand);
              };
              slashCommand.subcommandGroups.set(group.name, group);
            };
          };
          slashCommand.subcommandGroups.set('', { name: '', description: '', subcommands: subcommands });
        } else {
          slashCommand.options = data.options.map((option: any) => {
            return { name: option.name, description: option.description, type: option.type };
          });
        };
      };
      this.slashCommands.set(data.name, slashCommand);
    };
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    const commandName = this.doesInteractionHaveOption(interaction, 'command')
      ? this.getInteractionOption(interaction, 'command').value as string
      : '';
    const groupName = this.doesInteractionHaveOption(interaction, 'group')
      ? this.getInteractionOption(interaction, 'group').value as string
      : '';
    const subcommandName = this.doesInteractionHaveOption(interaction, 'subcommand')
      ? this.getInteractionOption(interaction, 'subcommand').value as string
      : '';
    const result = this.getCommandHelp(commandName, groupName, subcommandName);
    
    await interaction.reply(new MessagePayload(interaction, result));
  };

  private getCommandHelp(commandName: string, groupName: string, subcommandName: string) {
    const commandResponse = new CommandResponseBuilder();

    let helpEmbed: EmbedBuilder | undefined = undefined;
    if (isStringNullOrWhiteSpace(commandName)) {
      helpEmbed = this.formatCommandListEmbed();
    } else {
      const slashCommand = this.slashCommands.get(commandName);
      if (slashCommand) {
        if (slashCommand.subcommandGroups) {
          const group = slashCommand.subcommandGroups.get(groupName);
          if (group) {
            if (!isStringNullOrWhiteSpace(subcommandName)) {
              const subcommand = group.subcommands.get(subcommandName);
              if (!subcommand) {
                const subcommandError = isStringNullOrWhiteSpace(groupName)
                  ? `The ${inlineCode(subcommandName)} subcommand was not found in the ${inlineCode(commandName)} command.`
                  : `The ${inlineCode(subcommandName)} subcommand was not found in the ${inlineCode(groupName)} subcommand group.`;
                commandResponse.appendToError(subcommandError);
              };
            };
          } else {
            commandResponse.appendToError(`The ${inlineCode(groupName)} subcommand group was not found in the ${inlineCode(commandName)} command.`);
          };
        };

        if (!commandResponse.hasError) {
          helpEmbed = this.formatCommandHelpEmbed(slashCommand, groupName, subcommandName);
        };
      } else {
        commandResponse.appendToError(`The ${inlineCode(commandName)} command does not exist for this bot.`);
      };
    };

    if (helpEmbed) {
      return { 
        embeds: [helpEmbed],
        ephemeral: true
      };
    } else {
      return {
        content: commandResponse.resolve(),
        ephemeral: true
      };
    };
  };

  /** 
   * Constructs a message of the current available commands.
   * @returns A custom formatted embed object for a specific feature.
   */
  private formatCommandListEmbed() {
    const embedBuilder = new EmbedBuilder();
    const helpEmbedFields: { name: string, value: string }[] = [];

    const sortedCommands = [...this.slashCommands.values()].sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      } else if (a.name > b.name) {
        return 1;
      };
      return 0;
    });
    const commandsField = { name: underscore('Commands'), value: '' };
    const commandsFieldSegments = [];
    for (const slashCommand of sortedCommands) {
      commandsFieldSegments.push(`- ${inlineCode(slashCommand.name)}`);
    };
    commandsField.value = commandsFieldSegments.join(EOL);
    helpEmbedFields.push(commandsField);

    embedBuilder
      .setColor(Colors.Grey)
      .setTitle(`Command List`)
      .setDescription('All available commands for this bot.')
      .addFields(...helpEmbedFields);

    return embedBuilder;
  };

  /** 
   * Constructs a message of the requested command information.
   * @param slashCommand The requested slash command.
   * @param groupName The subcommand group name to query.
   * @param subcommandName The subcommand name to query.
   * @returns A custom formatted embed object for a specific feature.
   */
  private formatCommandHelpEmbed(slashCommand: SlashCommand, groupName = '', subcommandName = '') {
    const embedBuilder = new EmbedBuilder();
    const helpEmbedFields: { name: string, value: string }[] = [];

    if (slashCommand.options && slashCommand.options.length > 0) {
      const optionsField = { name: '▸ Options', value: '' };
      const optionsFieldSegments = [];
      for (const option of slashCommand.options) {
        optionsFieldSegments.push(`${inlineCode(option.name)} - ${option.description}`);
      };
      optionsField.value = optionsFieldSegments.join(EOL);
      helpEmbedFields.push(optionsField);
    } else if (slashCommand.subcommandGroups) {
      for (const group of slashCommand.subcommandGroups.values()) {
        if (isStringNullOrWhiteSpace(subcommandName)) {
          if (isStringNullOrWhiteSpace(groupName) || group.name === groupName) {
            const groupFieldTitle = isStringNullOrWhiteSpace(group.name)
              ? { name: underscore('Subcommands'), value: italic(`This command's subcommands.`) }
              : { name: `${underscore(group.name)} - Command Group`, value: italic(group.description) };
            helpEmbedFields.push(groupFieldTitle);
            for (const subcommand of group.subcommands.values()) {
              const subcommandField = {
                name: `▸ ${isStringNullOrWhiteSpace(group.name) ? subcommand.name : `${group.name} ${subcommand.name}`}`,
                value: ''
              };
              const subcommandFieldSegments: string[] = [italic(subcommand.description)];
              for (const option of subcommand.options) {
                subcommandFieldSegments.push(`${inlineCode(option.name)} - ${option.description}`);
              };
              subcommandField.value = subcommandFieldSegments.join(EOL);
              helpEmbedFields.push(subcommandField);
            };
          };
        } else if (group.name === groupName) {
          const subcommand = group.subcommands.get(subcommandName);
          if (subcommand) {
            const subcommandField = {
              name: `▸ ${isStringNullOrWhiteSpace(group.name) ? subcommand.name : `${group.name} ${subcommand.name}`}`,
              value: ''
            };
            const subcommandFieldSegments: string[] = [italic(subcommand.description)];
            for (const option of subcommand.options) {
              subcommandFieldSegments.push(`${inlineCode(option.name)} - ${option.description}`);
            };
            subcommandField.value = subcommandFieldSegments.join(EOL);
            helpEmbedFields.push(subcommandField);
          };
        };
      };
    };

    embedBuilder
      .setColor(Colors.Grey)
      .setTitle(`${inlineCode(slashCommand.name)} - Command Help`)
      .setDescription(slashCommand.description)
      .addFields(...helpEmbedFields);

    return embedBuilder;
  };
};
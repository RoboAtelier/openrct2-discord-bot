import { EOL } from 'os';
import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  inlineCode,
  italic,
  SlashCommandBuilder,
  underscore
} from 'discord.js';
import { 
  addCommandOptionChoices,
  CommandPermissionLevel,
  ResponseBuilder,
  OptionsDiscordBotCommand,
  SlashCommandData,
  SubcommandData,
  SubcommandGroupData
} from '@modules/discord/commands';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

const HelpCommandOptions = <const>[
  { 
    name: 'command',
    type: 'string',
    description: 'The name of the command to get help for.'
  },
  {
    name: 'group',
    type: 'string',
    description: 'The name of the subcommand group.'
  },
  {
    name: 'subcommand',
    type: 'string',
    description: 'The name of the subcommand.'
  }
];

/** Represents a command for information on bot commands. */
export class HelpCommand extends OptionsDiscordBotCommand<typeof HelpCommandOptions[number]> {
  private readonly slashCommands = new Map<string, SlashCommandData>();

  constructor(commandData: SlashCommandBuilder[]) {
    super(
      'help',
      'Provides command information for this bot.',
      HelpCommandOptions,
      CommandPermissionLevel.User
    );
    addCommandOptionChoices(
      this.data,
      'command',
      commandData.map(data => { return { name: data.name, value: data.name }; })
    );

    for (const data of commandData) {
      const slashCommand: SlashCommandData = {
        name: data.name,
        description: data.description,
        options: undefined,
        subcommandGroups: undefined
      };
      if (data.options.length > 0) {
        const optionCheck = data.options[0] as any;
        if (optionCheck.options !== undefined) {
          slashCommand.subcommandGroups = new Map<string, SubcommandGroupData>();
          const subcommands = new Map<string, SubcommandData>();
          for (const subcommandOrGroup of data.options as any[]) {
            if (0 === subcommandOrGroup.options.length || subcommandOrGroup.options[0].type !== undefined) { // subcommand
              const subcommand: SubcommandData = { name: subcommandOrGroup.name, description: subcommandOrGroup.description, options: [] };
              subcommand.options = subcommandOrGroup.options.map((option: any) => {
                return { name: option.name, description: option.description, type: option.type };
              });
              subcommands.set(subcommand.name, subcommand);
            } else { // group
              const group: SubcommandGroupData = { 
                name: subcommandOrGroup.name,
                description: subcommandOrGroup.description,
                subcommands: new Map<string, SubcommandData>()
              };
              for (const subcommand of subcommandOrGroup.options) {
                const groupSubcommand: SubcommandData = { name: subcommand.name, description: subcommand.description, options: [] };
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
  async execute(interaction: ChatInputCommandInteraction) {
    const response = new ResponseBuilder();
    const options = this.getInteractionOptionValues(interaction);

    this.getCommandHelp(
      response,
      options.get('command')?.value as string ?? '',
      options.get('group')?.value as string ?? '',
      options.get('subcommand')?.value as string ?? ''
    );
    
    await interaction.reply(response.resolve(interaction));
  };

  private getCommandHelp(
    response: ResponseBuilder,
    commandName: string,
    groupName: string,
    subcommandName: string
  ) {
    if (isStringNullOrWhiteSpace(commandName)) {
      response.addEmbeds(this.formatCommandListEmbed());
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
                response.addErrorText(subcommandError);
              };
            };
          } else {
            response.addErrorText(`The ${inlineCode(groupName)} subcommand group was not found in the ${inlineCode(commandName)} command.`);
          };
        };

        if (!response.hasError) {
          response.addEmbeds(this.formatCommandHelpEmbed(slashCommand, groupName, subcommandName));
        };
      } else {
        response.addErrorText(`The ${inlineCode(commandName)} command does not exist for this bot.`);
      };
    };
  };

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

  private formatCommandHelpEmbed(slashCommand: SlashCommandData, groupName = '', subcommandName = '') {
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
                subcommandFieldSegments.push(inlineCode(option.name));
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
              subcommandFieldSegments.push(inlineCode(option.name));
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
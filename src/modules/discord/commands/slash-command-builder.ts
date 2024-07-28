import {
  APIApplicationCommandOptionChoice,
  ApplicationCommandOptionAllowedChannelTypes,
  ApplicationCommandOptionType,
  ApplicationCommandOptionWithChoicesAndAutocompleteMixin,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder
} from 'discord.js';
import { CommandPermissionLevel } from '@modules/discord/commands';

export function buildSlashCommandOptions(
  builder: SlashCommandBuilder | SlashCommandSubcommandBuilder,
  commandOptions: ReadonlyArray<CommandOption>
) {
  for (const commandOption of commandOptions) {
    switch (commandOption.type) {
      case 'attachment':
        builder.addAttachmentOption(option =>
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false)
        );
        break;
      case 'boolean':
        builder.addBooleanOption(option =>
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false)
        );
        break;
      case 'channel':
        builder.addChannelOption(option => {
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false);
          if (commandOption.channelTypes) {
            option.addChannelTypes(...commandOption.channelTypes);
          };
          return option;
        });
        break;
      case 'integer':
        builder.addIntegerOption(option => {
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false);
          if (commandOption.autocomplete) {
            option.setAutocomplete(commandOption.autocomplete);
          };
          if (commandOption.minValue != undefined) {
            option.setMinValue(commandOption.minValue)
          };
          if (commandOption.maxValue != undefined) {
            option.setMaxValue(commandOption.maxValue);
          };
          if (commandOption.choices) {
            option.setChoices(...(commandOption.choices as APIApplicationCommandOptionChoice<number>[]));
          };
          return option;
        });
        break;
      case 'mentionable':
        builder.addMentionableOption(option =>
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false)
        );
        break;
      case 'number':
        builder.addNumberOption(option => {
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false);
          if (commandOption.autocomplete) {
            option.setAutocomplete(commandOption.autocomplete);
          };
          if (commandOption.minValue != undefined) {
            option.setMinValue(commandOption.minValue)
          };
          if (commandOption.maxValue != undefined) {
            option.setMaxValue(commandOption.maxValue);
          };
          if (commandOption.choices) {
            option.setChoices(...(commandOption.choices as APIApplicationCommandOptionChoice<number>[]));
          };
          return option;
        });
        break;
      case 'role':
        builder.addRoleOption(option =>
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false)
        );
        break;
      case 'string':
        builder.addStringOption(option => {
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false);
          if (commandOption.autocomplete) {
            option.setAutocomplete(commandOption.autocomplete);
          };
          if (commandOption.minLength != undefined) {
            option.setMinLength(commandOption.minLength)
          };
          if (commandOption.maxLength != undefined) {
            option.setMaxLength(commandOption.maxLength);
          };
          if (commandOption.choices) {
            option.setChoices(...(commandOption.choices as APIApplicationCommandOptionChoice<string>[]));
          };
          return option;
        });
        break;
      case 'user':
        builder.addUserOption(option =>
          option
            .setName(commandOption.name)
            .setDescription(commandOption.description)
            .setRequired(commandOption.required ?? false)
        );
        break;
      default:
        throw new Error('Cannot build slash command option.');
    };
  };
};

export function buildSlashCommandSubcommands(
  builder: SlashCommandBuilder,
  groups?: ReadonlyArray<SubcommandGroup>,
  subcommands?: ReadonlyArray<Subcommand>
) {
  if (groups) {
    for (const group of groups) {
      builder.addSubcommandGroup(scg => {
        scg.setName(group.name);
        scg.setDescription(group.description ?? 'No description.');
        for (const subcommand of group.subcommands) {
          scg.addSubcommand(sc => {
            sc
              .setName(subcommand.name)
              .setDescription(subcommand.description);
            if (subcommand.options) {
              buildSlashCommandOptions(sc, subcommand.options);
            };
            return sc;
          });
        };
        return scg;
      });
    };
  };

  if (subcommands) {
    for (const subcommand of subcommands) {
      builder.addSubcommand(sc => {
        sc
          .setName(subcommand.name)
          .setDescription(subcommand.description);
        if (subcommand.options) {
          buildSlashCommandOptions(sc, subcommand.options);
        };
        return sc;
      });
    };
  };
};

export function addCommandOptionChoices(
  builder: SlashCommandBuilder,
  optionName: string,
  choices: APIApplicationCommandOptionChoice<string | number>[],
  groupName?: string,
  subcommandName?: string
) {
  if (builder.options.length > 0) {
    let selectedOption: ApplicationCommandOptionWithChoicesAndAutocompleteMixin<string | number> | undefined;

    const optionCheck = builder.options[0] as any;
    if (optionCheck.options !== undefined) {
      for (const subcommandOrGroup of builder.options as any[]) {
        if (0 === subcommandOrGroup.options.length || subcommandOrGroup.options[0].type !== undefined) { // subcommand
          const subcommand = subcommandOrGroup as SlashCommandSubcommandBuilder;
          if (subcommand.name === subcommandName) {
            selectedOption = subcommand.options.find(
              (option: any) => option.name === optionName && CommandTypesWithChoices.includes(option.type)
            ) as ApplicationCommandOptionWithChoicesAndAutocompleteMixin<string | number> | undefined;
          };
        } else { // group
          const group = subcommandOrGroup as SlashCommandSubcommandGroupBuilder;
          if (group.name === groupName) {
            for (const subcommand of subcommandOrGroup.options as SlashCommandSubcommandBuilder[]) {
              if (subcommand.name === subcommandName) {
                selectedOption = subcommand.options.find(
                  (option: any) => option.name === optionName && CommandTypesWithChoices.includes(option.type)
                ) as ApplicationCommandOptionWithChoicesAndAutocompleteMixin<string | number> | undefined;
              };
            };
          };
        };
      };
    } else {
      selectedOption = builder.options.find(
        (option: any) => option.name === optionName && CommandTypesWithChoices.includes(option.type)
      ) as ApplicationCommandOptionWithChoicesAndAutocompleteMixin<string | number> | undefined;
    };

    if (selectedOption) {
      selectedOption.type
      selectedOption.addChoices(...choices);
    };
  };
};

export type SubcommandGroup = {
  readonly name: string;
  readonly description?: string;
  readonly subcommands: ReadonlyArray<Subcommand>;
  readonly permissionLevel?: CommandPermissionLevel;
};

export type Subcommand = {
  readonly name: string;
  readonly description: string;
  readonly options: ReadonlyArray<CommandOption> | null;
  readonly permissionLevel?: CommandPermissionLevel;
};

export type CommandOption = {
  readonly name: string;
  readonly type: CommandOptionType;
  readonly description: string;
  readonly required?: boolean;
  readonly permissionLevel?: CommandPermissionLevel;
  readonly permissionedValues?: ReadonlyArray<PermissionedCommandOptionValue>;
  // Option-specific valuesd
  readonly autocomplete?: boolean; // integer, number, string
  readonly channelTypes?: ApplicationCommandOptionAllowedChannelTypes[];
  readonly minValue?: number; // integer, number
  readonly maxValue?: number; // integer, number
  readonly choices?: APIApplicationCommandOptionChoice<string | number>[]; // integer, number, string
  readonly minLength?: number; // string
  readonly maxLength?: number; // string
};

export type SlashCommandData = {
  name: string,
  description: string,
  options: CommandOptionData[] | undefined,
  subcommandGroups: Map<string, SubcommandGroupData> | undefined
};

export type CommandOptionData = {
  name: string,
  description: string,
  type: number
};

export type SubcommandData = {
  name: string,
  description: string,
  options: CommandOptionData[]
};

export type SubcommandGroupData = {
  name: string,
  description: string,
  subcommands: Map<string, SubcommandData>
};

const CommandTypesWithChoices = <const>[
  ApplicationCommandOptionType.String,
  ApplicationCommandOptionType.Integer,
  ApplicationCommandOptionType.Number
]

type CommandOptionType =
  | 'attachment'
  | 'boolean'
  | 'channel'
  | 'integer'
  | 'mentionable'
  | 'number'
  | 'role'
  | 'string'
  | 'user';

type PermissionedCommandOptionValue = {
  readonly value: string | number | boolean;
  readonly permissionLevel: CommandPermissionLevel;
};
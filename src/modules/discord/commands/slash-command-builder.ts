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

// declare interface TypedBooleanOption<O extends CommandOption> extends SlashCommandBooleanOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedUserOption<O extends CommandOption> extends SlashCommandUserOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedChannelOption<O extends CommandOption> extends SlashCommandChannelOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedRoleOption<O extends CommandOption> extends SlashCommandRoleOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedAttachmentOption<O extends CommandOption> extends SlashCommandAttachmentOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedMentionableOption<O extends CommandOption> extends SlashCommandMentionableOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedStringOption<O extends CommandOption> extends SlashCommandStringOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedIntegerOption<O extends CommandOption> extends SlashCommandIntegerOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedNumberOption<O extends CommandOption> extends SlashCommandNumberOption {
//   setName(name: O['name']): this;
// };

// declare interface TypedSubcommandGroupBuilder<
//   G extends SubcommandGroup
// > extends SlashCommandSubcommandGroupBuilder {
//   setName<GName extends G['name']>(name: GName): this;
//   addSubcommand<GName extends G['subcommands'][number]['name']>(
//     input: TypedSubcommandBuilder<Extract<G['subcommands'][number], { name: GName }>>
//     | ((subcommandGroup: TypedSubcommandBuilder<Extract<G['subcommands'][number], { name: GName }>>) => TypedSubcommandBuilder<Extract<G['subcommands'][number], { name: GName }>>)
//   ): this;
// };

// declare interface TypedSubcommandBuilder<
//   S extends Subcommand
// > extends SlashCommandSubcommandBuilder {
//   setName(name: S['name']): this;
//   addBooleanOption(
//     input:
//       | TypedBooleanOption<NonNullable<Extract<S, { name: S['name'] }>['options']>[number]>
//       | ((builder: TypedBooleanOption<NonNullable<Extract<S, { name: S['name'] }>['options']>[number]>) => TypedBooleanOption<NonNullable<Extract<S, { name: S['name'] }>['options']>[number]>)
//   ): this;
//   addUserOption(
//     input:
//       | TypedUserOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedUserOption<NonNullable<S['options']>[number]>) => TypedUserOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addChannelOption(
//     input:
//       | TypedChannelOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedChannelOption<NonNullable<S['options']>[number]>) => TypedChannelOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addRoleOption(
//     input:
//       | TypedRoleOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedRoleOption<NonNullable<S['options']>[number]>) => TypedRoleOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addAttachmentOption(
//     input:
//       | TypedAttachmentOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedAttachmentOption<NonNullable<S['options']>[number]>) => TypedAttachmentOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addMentionableOption(
//     input:
//       | TypedMentionableOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedMentionableOption<NonNullable<S['options']>[number]>) => TypedMentionableOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addStringOption(
//     input: 
//       | TypedStringOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedStringOption<NonNullable<S['options']>[number]>) => TypedStringOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addIntegerOption(
//     input:
//       | TypedIntegerOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedIntegerOption<NonNullable<S['options']>[number]>) => TypedIntegerOption<NonNullable<S['options']>[number]>)
//   ): this;
//   addNumberOption(
//     input:
//       | TypedNumberOption<NonNullable<S['options']>[number]>
//       | ((builder: TypedNumberOption<NonNullable<S['options']>[number]>) => TypedNumberOption<NonNullable<S['options']>[number]>)
//   ): this;
// };

// declare interface TypedSubcommandsOnlyBuilder<
//   G extends SubcommandGroup | null,
//   S extends Subcommand | null
// > extends SlashCommandSubcommandsOnlyBuilder {
//   addSubcommandGroup<GName extends NonNullable<G>['name']>(
//     input:
//       | TypedSubcommandGroupBuilder<Extract<G, { name: GName }>>
//       | ((builder: TypedSubcommandGroupBuilder<Extract<G, { name: GName }>>) => TypedSubcommandGroupBuilder<Extract<G, { name: GName }>>)
//   ): this;
//   addSubcommand<SName extends NonNullable<S>['name']>(
//     input:
//       | TypedSubcommandBuilder<Extract<S, { name: SName }>>
//       | ((builder: TypedSubcommandBuilder<Extract<S, { name: SName }>>) => TypedSubcommandBuilder<Extract<S, { name: SName }>>)
//   ): this;
// };

// /**
//  * Represents a `SlashCommandBuilder` that enforces the naming of
//  * command options, subcommands, and groups to only the declared types within the builder.
//  */
// export declare class TypedSlashCommandBuilder<
//   G extends SubcommandGroup | null,
//   S extends Subcommand | null,
//   O extends CommandOption | null
// > extends SlashCommandBuilder {
//   addBooleanOption(
//     input:
//       | TypedBooleanOption<NonNullable<O>>
//       | ((builder: TypedBooleanOption<NonNullable<O>>) => TypedBooleanOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addUserOption(
//     input:
//       | TypedUserOption<NonNullable<O>>
//       | ((builder: TypedUserOption<NonNullable<O>>) => TypedUserOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addChannelOption(
//     input:
//       | TypedChannelOption<NonNullable<O>>
//       | ((builder: TypedChannelOption<NonNullable<O>>) => TypedChannelOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addRoleOption(
//     input:
//       | TypedRoleOption<NonNullable<O>>
//       | ((builder: TypedRoleOption<NonNullable<O>>) => TypedRoleOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addAttachmentOption(
//     input:
//       | TypedAttachmentOption<NonNullable<O>>
//       | ((builder: TypedAttachmentOption<NonNullable<O>>) => TypedAttachmentOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addMentionableOption(
//     input:
//       | TypedMentionableOption<NonNullable<O>>
//       | ((builder: TypedMentionableOption<NonNullable<O>>) => TypedMentionableOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addStringOption(
//     input: 
//       | TypedStringOption<NonNullable<O>>
//       | ((builder: TypedStringOption<NonNullable<O>>) => TypedStringOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addIntegerOption(
//     input:
//       | TypedIntegerOption<NonNullable<O>>
//       | ((builder: TypedIntegerOption<NonNullable<O>>) => TypedIntegerOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addNumberOption(
//     input:
//       | TypedNumberOption<NonNullable<O>>
//       | ((builder: TypedNumberOption<NonNullable<O>>) => TypedNumberOption<NonNullable<O>>)
//   ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
//   addSubcommandGroup<GName extends NonNullable<G>['name']>(
//     input:
//       | TypedSubcommandGroupBuilder<Extract<NonNullable<G>, { name: GName }>>
//       | ((builder: TypedSubcommandGroupBuilder<Extract<NonNullable<G>, { name: GName }>>) => TypedSubcommandGroupBuilder<Extract<NonNullable<G>, { name: GName }>>)
//   ): TypedSubcommandsOnlyBuilder<G, S>;
//   addSubcommand<SName extends NonNullable<S>['name']>(
//     input:
//       | TypedSubcommandBuilder<Extract<NonNullable<S>, { name: SName }>>
//       | ((builder: TypedSubcommandBuilder<Extract<NonNullable<S>, { name: SName }>>) => TypedSubcommandBuilder<Extract<NonNullable<S>, { name: SName }>>)
//   ): TypedSubcommandsOnlyBuilder<G, S>;
// };
import { EOL } from 'os';
import {
  inlineCode,
  italic,
  Colors,
  EmbedBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from 'discord.js';
import { CommandPermissionLevel } from '@modules/discord/commands';

/**
 * Represents a base class for bot commands.
 * @abstract
 */
export abstract class BotCommand<
  Options extends string | null,
  Subcommands extends string | null,
  SubcommandGroups extends string | null
> {

  /** The maximum number of entries to return from a command result array section. */
  protected static readonly resultSetElementsLimit = 10;

  /** Gets the Discord slash command configuration data. */
  readonly data = new SlashCommandBuilder();

  /** Gets the required permission level to execute this command. */
  readonly permissionLevel: CommandPermissionLevel;

  constructor(permissionLevel = CommandPermissionLevel.Manager) {
    this.permissionLevel = permissionLevel;
  };

  /**
   * Runs the command.
   * @async
   * @param interaction The Discord chat interaction that invoked the command.
   * @param userLevel The command permission level of the user that invoked the command.
   */
  abstract execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel): Promise<void>;

  /**
   * Returns backs the option name string for type-checking purposes.
   * @param option The option name string to reflect.
   * @returns The name string specified.
   */
  protected reflectOptionName(option: NonNullable<Options>) {
    return option;
  };

  /**
   * Returns backs the subcommand name string for type-checking purposes.
   * @param subcommand The subcommand name string to reflect.
   * @returns The name string specified.
   */
  protected reflectSubcommandName(subcommand: NonNullable<Subcommands>) {
    return subcommand;
  };

  /**
   * Returns backs the subcommand group name string for type-checking purposes.
   * @param subcommandGroup The subcommand group name string to reflect.
   * @returns The name string specified.
   */
  protected reflectSubcommandGroupName(subcommandGroup: NonNullable<SubcommandGroups>) {
    return subcommandGroup;
  };

  protected getInteractionOption(
    interaction: ChatInputCommandInteraction,
    option: NonNullable<Options>
  ) {
    const cmdOption = interaction.options.get(option);
    if (cmdOption) {
      return cmdOption;
    };
    throw new Error('Option was not specified for this interaction.');
  };

  /**
   * Checks that a Discord chat command interaction has a declared option.
   * @param interaction The current Discord chat command interaction.
   * @param option The name of the option.
   */
  protected doesInteractionHaveOption(
    interaction: ChatInputCommandInteraction,
    option: NonNullable<Options>
  ) {
    const optionCheck = interaction.options.get(option);
    return optionCheck !== null;
  };

  /**
   * Checks that a Discord chat command interaction is using a subcommand.
   * @param interaction The current Discord chat command interaction.
   * @param subcommand The name of the subcommand.
   */
  protected isInteractionUsingSubcommand(
    interaction: ChatInputCommandInteraction,
    subcommand: NonNullable<Subcommands> | 'help'
  ) {
    return subcommand === interaction.options.getSubcommand();
  };

  /**
   * Checks that a Discord chat command interaction
   * is using a subcommand under a subcommand group.
   * @param interaction The current Discord chat command interaction.
   * @param subcommandGroup The name of the subcommand group.
   */
  protected isInteractionUnderSubcommandGroup(
    interaction: ChatInputCommandInteraction,
    subcommandGroup: NonNullable<SubcommandGroups>
  ) {
    return subcommandGroup === interaction.options.getSubcommandGroup();
  };

  protected formatOptionPermissionError(option: NonNullable<Options>) {
    return `You cannot use the ${inlineCode(option)} option.`
  };

  protected formatSubcommandPermissionError(group: SubcommandGroups | null, subcommand: NonNullable<Subcommands>) {
    return `You cannot use the ${inlineCode(`${group ? `${group} ${subcommand}` : subcommand}`)} command.`
  };

  protected formatSubcommandGroupPermissionError(group: NonNullable<SubcommandGroups>) {
    return `You cannot use ${inlineCode(group)} commands.`
  };
};
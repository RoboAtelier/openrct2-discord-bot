import {
  SlashCommandAttachmentOption,
  SlashCommandBooleanOption,
  SlashCommandBuilder,
  SlashCommandChannelOption,
  SlashCommandIntegerOption,
  SlashCommandMentionableOption,
  SlashCommandNumberOption,
  SlashCommandRoleOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandUserOption
} from 'discord.js';
import { CommandPermissionLevel } from '@modules/discord/commands';

export type SubcommandGroup = {
  readonly name: string;
  readonly subcommands: ReadonlyArray<Subcommand>;
  readonly permissionLevel?: CommandPermissionLevel;
};

export type Subcommand = {
  readonly name: string;
  readonly options?: ReadonlyArray<CommandOption>;
  readonly permissionLevel?: CommandPermissionLevel;
};

export type CommandOption = {
  readonly name: string;
  readonly permissionLevel?: CommandPermissionLevel;
};

declare interface TypedBooleanOption<O extends CommandOption> extends SlashCommandBooleanOption {
  setName(name: O['name']): this;
};

declare interface TypedUserOption<O extends CommandOption> extends SlashCommandUserOption {
  setName(name: O['name']): this;
};

declare interface TypedChannelOption<O extends CommandOption> extends SlashCommandChannelOption {
  setName(name: O['name']): this;
};

declare interface TypedRoleOption<O extends CommandOption> extends SlashCommandRoleOption {
  setName(name: O['name']): this;
};

declare interface TypedAttachmentOption<O extends CommandOption> extends SlashCommandAttachmentOption {
  setName(name: O['name']): this;
};

declare interface TypedMentionableOption<O extends CommandOption> extends SlashCommandMentionableOption {
  setName(name: O['name']): this;
};

declare interface TypedStringOption<O extends CommandOption> extends SlashCommandStringOption {
  setName(name: O['name']): this;
};

declare interface TypedIntegerOption<O extends CommandOption> extends SlashCommandIntegerOption {
  setName(name: O['name']): this;
};

declare interface TypedNumberOption<O extends CommandOption> extends SlashCommandNumberOption {
  setName(name: O['name']): this;
};

declare interface TypedSubcommandGroupBuilder<
  G extends SubcommandGroup
> extends SlashCommandSubcommandGroupBuilder {
  setName<GName extends G['name']>(name: GName): this;
  addSubcommand<GName extends G['subcommands'][number]['name']>(
    input: TypedSubcommandBuilder<Extract<G['subcommands'][number], { name: GName }>>
    | ((subcommandGroup: TypedSubcommandBuilder<Extract<G['subcommands'][number], { name: GName }>>) => TypedSubcommandBuilder<Extract<G['subcommands'][number], { name: GName }>>)
  ): this;
};

declare interface TypedSubcommandBuilder<
  S extends Subcommand
> extends SlashCommandSubcommandBuilder {
  setName(name: S['name']): this;
  addBooleanOption(
    input:
      | TypedBooleanOption<NonNullable<Extract<S, { name: S['name'] }>['options']>[number]>
      | ((builder: TypedBooleanOption<NonNullable<Extract<S, { name: S['name'] }>['options']>[number]>) => TypedBooleanOption<NonNullable<Extract<S, { name: S['name'] }>['options']>[number]>)
  ): this;
  addUserOption(
    input:
      | TypedUserOption<NonNullable<S['options']>[number]>
      | ((builder: TypedUserOption<NonNullable<S['options']>[number]>) => TypedUserOption<NonNullable<S['options']>[number]>)
  ): this;
  addChannelOption(
    input:
      | TypedChannelOption<NonNullable<S['options']>[number]>
      | ((builder: TypedChannelOption<NonNullable<S['options']>[number]>) => TypedChannelOption<NonNullable<S['options']>[number]>)
  ): this;
  addRoleOption(
    input:
      | TypedRoleOption<NonNullable<S['options']>[number]>
      | ((builder: TypedRoleOption<NonNullable<S['options']>[number]>) => TypedRoleOption<NonNullable<S['options']>[number]>)
  ): this;
  addAttachmentOption(
    input:
      | TypedAttachmentOption<NonNullable<S['options']>[number]>
      | ((builder: TypedAttachmentOption<NonNullable<S['options']>[number]>) => TypedAttachmentOption<NonNullable<S['options']>[number]>)
  ): this;
  addMentionableOption(
    input:
      | TypedMentionableOption<NonNullable<S['options']>[number]>
      | ((builder: TypedMentionableOption<NonNullable<S['options']>[number]>) => TypedMentionableOption<NonNullable<S['options']>[number]>)
  ): this;
  addStringOption(
    input: 
      | TypedStringOption<NonNullable<S['options']>[number]>
      | ((builder: TypedStringOption<NonNullable<S['options']>[number]>) => TypedStringOption<NonNullable<S['options']>[number]>)
  ): this;
  addIntegerOption(
    input:
      | TypedIntegerOption<NonNullable<S['options']>[number]>
      | ((builder: TypedIntegerOption<NonNullable<S['options']>[number]>) => TypedIntegerOption<NonNullable<S['options']>[number]>)
  ): this;
  addNumberOption(
    input:
      | TypedNumberOption<NonNullable<S['options']>[number]>
      | ((builder: TypedNumberOption<NonNullable<S['options']>[number]>) => TypedNumberOption<NonNullable<S['options']>[number]>)
  ): this;
};

declare interface TypedSubcommandsOnlyBuilder<
  G extends SubcommandGroup | null,
  S extends Subcommand | null
> extends SlashCommandSubcommandsOnlyBuilder {
  addSubcommandGroup<GName extends NonNullable<G>['name']>(
    input:
      | TypedSubcommandGroupBuilder<Extract<G, { name: GName }>>
      | ((builder: TypedSubcommandGroupBuilder<Extract<G, { name: GName }>>) => TypedSubcommandGroupBuilder<Extract<G, { name: GName }>>)
  ): this;
  addSubcommand<SName extends NonNullable<S>['name']>(
    input:
      | TypedSubcommandBuilder<Extract<S, { name: SName }>>
      | ((builder: TypedSubcommandBuilder<Extract<S, { name: SName }>>) => TypedSubcommandBuilder<Extract<S, { name: SName }>>)
  ): this;
};

/**
 * Represents a `SlashCommandBuilder` that enforces the naming of
 * command options, subcommands, and groups to only the declared types within the builder.
 */
export declare class TypedSlashCommandBuilder<
  G extends SubcommandGroup | null,
  S extends Subcommand | null,
  O extends CommandOption | null
> extends SlashCommandBuilder {
  addBooleanOption(
    input:
      | TypedBooleanOption<NonNullable<O>>
      | ((builder: TypedBooleanOption<NonNullable<O>>) => TypedBooleanOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addUserOption(
    input:
      | TypedUserOption<NonNullable<O>>
      | ((builder: TypedUserOption<NonNullable<O>>) => TypedUserOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addChannelOption(
    input:
      | TypedChannelOption<NonNullable<O>>
      | ((builder: TypedChannelOption<NonNullable<O>>) => TypedChannelOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addRoleOption(
    input:
      | TypedRoleOption<NonNullable<O>>
      | ((builder: TypedRoleOption<NonNullable<O>>) => TypedRoleOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addAttachmentOption(
    input:
      | TypedAttachmentOption<NonNullable<O>>
      | ((builder: TypedAttachmentOption<NonNullable<O>>) => TypedAttachmentOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addMentionableOption(
    input:
      | TypedMentionableOption<NonNullable<O>>
      | ((builder: TypedMentionableOption<NonNullable<O>>) => TypedMentionableOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addStringOption(
    input: 
      | TypedStringOption<NonNullable<O>>
      | ((builder: TypedStringOption<NonNullable<O>>) => TypedStringOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addIntegerOption(
    input:
      | TypedIntegerOption<NonNullable<O>>
      | ((builder: TypedIntegerOption<NonNullable<O>>) => TypedIntegerOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addNumberOption(
    input:
      | TypedNumberOption<NonNullable<O>>
      | ((builder: TypedNumberOption<NonNullable<O>>) => TypedNumberOption<NonNullable<O>>)
  ): Omit<this, 'addSubcommandGroup' | 'addSubcommand'>;
  addSubcommandGroup<GName extends NonNullable<G>['name']>(
    input:
      | TypedSubcommandGroupBuilder<Extract<NonNullable<G>, { name: GName }>>
      | ((builder: TypedSubcommandGroupBuilder<Extract<NonNullable<G>, { name: GName }>>) => TypedSubcommandGroupBuilder<Extract<NonNullable<G>, { name: GName }>>)
  ): TypedSubcommandsOnlyBuilder<G, S>;
  addSubcommand<SName extends NonNullable<S>['name']>(
    input:
      | TypedSubcommandBuilder<Extract<NonNullable<S>, { name: SName }>>
      | ((builder: TypedSubcommandBuilder<Extract<NonNullable<S>, { name: SName }>>) => TypedSubcommandBuilder<Extract<NonNullable<S>, { name: SName }>>)
  ): TypedSubcommandsOnlyBuilder<G, S>;
};
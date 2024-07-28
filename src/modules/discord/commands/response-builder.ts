import {
  ActionRowData,
  APIAttachment,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  BufferResolvable,
  EmbedBuilder,
  JSONEncodable,
  MessageActionRowComponentBuilder,
  MessageActionRowComponentData,
  MessagePayload,
  MessageTarget
} from 'discord.js';
import { EOL } from 'os';

/** Represents a builder for a result response payload.*/
export class ResponseBuilder {
  private contentSegments: string[] = [];
  private errorSegments: string[] = [];
  private embeds: EmbedBuilder[] = [];
  private files: (
    | BufferResolvable
    | JSONEncodable<APIAttachment>
    | Attachment
    | AttachmentBuilder
    | AttachmentPayload
  )[] = [];
  private components: ActionRowData<MessageActionRowComponentData | MessageActionRowComponentBuilder>[] = [];

  /** Specifies if message text is present. */
  get hasText() {
    return this.contentSegments.length;
  };

  /** Specifies if any message content is present. */
  get hasContent() {
    return this.contentSegments.length
      || this.embeds.length
      || this.files.length;
  };

  /** Specifies if an error message is present. */
  get hasError() {
    return this.errorSegments.length;
  };

  /** 
   * Resolves the response message payload.
   * This will return the error message first if there is one;
   * otherwise, it will return the response content.
   */
  resolve(target: MessageTarget): MessagePayload {
    if (this.hasError) {
      return new MessagePayload(
        target,
        { content: this.errorSegments.length ? this.contentSegments.join(EOL) : undefined }
      );
    };
    return new MessagePayload(
      target,
      {
        content: this.contentSegments.length ? this.contentSegments.join(EOL) : undefined,
        embeds: this.embeds.length ? this.embeds : undefined,
        files: this.files.length ? this.files : undefined,
        components: this.components.length ? this.components : undefined
      }
    );
  };

  /**
   * Adds text to the response message.
   * @param textSegments - The text string(s) to add.
   */
  addText(...textSegments: string[]) {
    this.contentSegments.push(...textSegments);
  };

  /**
   * Adds text to the beginning of the response message.
   * @param textSegments - The text string(s) to add.
   */
  addTextToStart(...textSegments: string[]) {
    this.contentSegments.unshift(...textSegments);
  };

  /**
   * Adds text to the error message.
   * @param errorSegments - The error text string(s) to add.
   */
  addErrorText(...errorSegments: string[]) {
    this.errorSegments.push(...errorSegments);
  };

  addEmbeds(...embeds: EmbedBuilder[]) {
    this.embeds.push(...embeds);
  };

  addFiles(
    ...files: (
      | BufferResolvable
      | JSONEncodable<APIAttachment>
      | Attachment
      | AttachmentBuilder
      | AttachmentPayload
    )[]
  ) {
    this.files.push(...files);
  };

  addComponents(...components: ActionRowData<MessageActionRowComponentData | MessageActionRowComponentBuilder>[]) {
    this.components?.push(...components);
  };

  /** Wipes the current response. */
  reset() {
    this.contentSegments = [];
    this.errorSegments = [];
    this.embeds = [];
    this.files = [];
    this.components = [];
  };
};
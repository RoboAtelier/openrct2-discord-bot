import {
  ChannelType,
  Client,
  MessagePayload,
  Snowflake,
  TextBasedChannelFields,
} from 'discord.js';
import { EOL } from 'os';
import { Mutex } from 'async-mutex';

export class DiscordMessenger {
  private readonly discordClient: Client<true>;
  private readonly messageMutex = new Mutex();
  private readonly delayQueue = new Map<string, string>();
  private readonly delayTimeout = new Map<string, NodeJS.Timeout>();
  private readonly delayMutex = new Mutex();

  constructor(discordClient: Client<true>) {
    this.discordClient = discordClient;
  };

  createPayloadForTextChannel(channelId: Snowflake) {
    const channel = this.resolveTextChannel(channelId);
    return new MessagePayload(channel, {});
  };

  async sendMessageToTextChannel(channelId: Snowflake, messagePayload: string | MessagePayload) {
    const channel = this.resolveTextChannel(channelId);
    // expose send() method that should exist
    const sendableChannel = channel as unknown as TextBasedChannelFields;
    return this.messageMutex.runExclusive(async () => {
      const msg = await sendableChannel.send(messagePayload);
      await new Promise(resolve => {
        setTimeout(resolve, 250);
      });
      return msg;
    });
  };

  resolveTextChannel(channelId: Snowflake) {
    const channel = this.discordClient.channels.cache.get(channelId);
    if (
      // expected to change as Discord updates API
      channel && (
        channel.type === ChannelType.DM
        || channel.type === ChannelType.GuildText
        || channel.type === ChannelType.GuildVoice
        || channel.type === ChannelType.PublicThread
      )
    ) {
      return channel;
    };
    throw new Error('Channel id could not be resolved to a valid text channel.');
  };

  // /**
  //  * Creates a message that is sent after a certain amount of time has passed.
  //  * Subsequent calls to this method before the delayed message is sent will
  //  * append more content to the message object.
  //  * @async
  //  * @param channel The Discord guild text channel to post the message at.
  //  * @param messageStr The message string to send or append to the final message to be sent.
  //  * @param messageDelayMs The amount of milliseconds to wait before sending off the message.
  //  */
  // async sendOffDelayedMessage(
  //   guild: Guild,
  //   channelId: string,
  //   messageStr: string,
  //   messageDelayMs = 5000
  // ) {
  //   await this.delayMutex.runExclusive(async () => {
  //     if (!this.delayTimeout.has(channelId)) {
  //       const timeout = setTimeout(async () => {
  //         await this.delayMutex.runExclusive(async () => {
  //           const toSend = this.delayQueue.get(channelId) as string;
  //           this.delayQueue.delete(channelId);
  //           this.delayTimeout.delete(channelId);
  //           await channel.send(toSend);
  //         });
  //       }, messageDelayMs);
  //       this.delayQueue.set(channelId, messageStr);
  //       this.delayTimeout.set(channelId, timeout);
  //     } else {
  //       let delayedMessageStr = this.delayQueue.get(channelId) as string;
  //       delayedMessageStr = `${delayedMessageStr}${EOL}${messageStr}`;
  //       this.delayQueue.set(channelId, delayedMessageStr);
  //     };
  //   });
  // };
};

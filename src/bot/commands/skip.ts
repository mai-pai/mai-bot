import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class SkipCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '[queue position]';
  }

  public description(): string {
    return 'Skips the current song.  If a position in the queue is provided, the bot will skip to that song instead of the next song in the queue.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (this.bot.player.isPlaying(guild)) {
      let skipTo = 1;
      if (args) {
        skipTo = parseInt(args.trim(), 10);
        if (isNaN(skipTo) || skipTo < 1) return this.onBlock(message, BlockReason.InvalidArgs);
        if (!this.bot.player.isInRange(guild, skipTo))
          return message.channel.send(':x: The specified position is outside of the queue length!');
      }

      this.bot.player.skip(guild, skipTo);
      return message.channel.send(':ballot_box_with_check: The current song has been skipped.');
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}

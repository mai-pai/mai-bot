import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class RemoveCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '[position]';
  }

  public description(): string {
    return 'Removes a song from the queue. If a song position is not provided, the current song playing will be removed.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (!this.bot.player.isPlaying(guild)) return this.onBlock(message, BlockReason.NotPlaying);

    let songNumber = 0;
    if (args) {
      songNumber = parseInt(args.trim(), 10);
      if (isNaN(songNumber) || songNumber < 1) return this.onBlock(message, BlockReason.InvalidArgs);
      if (!this.bot.player.isInRange(guild, songNumber))
        return message.channel.send(':x: The specified position is outside of the queue length!');
    }

    const entry = this.bot.player.removeSong(guild, songNumber);
    if (entry)
      return message.channel.send(`:ballot_box_with_check: The track: \`${entry.song.title}\` has been removed.`);

    return message.channel.send(':x: Something went horribly wrong, unable to remove song at specified position!');
  }
}

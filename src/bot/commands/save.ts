import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class SaveCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return 'Save the current playlist as your personal playlist, overwriting your previous saved playlist.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (this.bot.player.isPlaying(guild)) {
      if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

      const err = this.bot.player.save(guild, message.member.id);

      if (err) return message.channel.send(`:x: ${err.message}`);

      return message.channel.send(`:ballot_box_with_check: Playlist save as \`${message.member.displayName}'s Playlist\`.`);
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}

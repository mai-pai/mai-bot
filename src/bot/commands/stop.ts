import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';

export class StopCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public description(): string {
    return 'Stops the current song and disconnect the bot from the voice channel. Queued songs and current song is preserved for next bot summon.';
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const blockedMessage = this.checkPermissions(message);
    if (blockedMessage) return blockedMessage;

    const guild = message.guild.id;
    if (this.bot.player.isPlaying(guild)) {
      if (args) return this.onBlock(message, BlockReason.NoArgsNeeded);

      this.bot.player.stop(guild);
      message.guild.voiceConnection.disconnect();
      return message.channel.send(
        ':ballot_box_with_check: The player has been stopped and the bot has disconnected from the voice channel.'
      );
    }

    return this.onBlock(message, BlockReason.NotPlaying);
  }
}

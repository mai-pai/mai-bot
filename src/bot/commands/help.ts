import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { Command } from './base';

export class HelpCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public run(message: Message, args: string): Promise<Message | Message[]> {
    const embed = this.bot.getHelpEmbed(message);

    return message.channel.send('**Commands**', embed);
  }
}

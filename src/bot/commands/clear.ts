import { Message } from 'discord.js';
import { Command } from './base';

export class ClearCommand extends Command {
  public run(message: Message, args: string): Promise<Message | Message[]> {
    return message.channel.send('Bot function not implemented.');
  }
}

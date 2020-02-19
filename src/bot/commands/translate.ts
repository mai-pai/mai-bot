import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';
import miniget = require('miniget');

type Translation = {
  sourceText: string;
  translatedText: string;
};

const TRANSLATE_URL = 'https://script.google.com/macros/s/AKfycby2Uy7BjXaQm24MNkNmVkTF56EG0sGpVcKZaKlsLlty_0KlrY4/exec';
export class TranslateCommand extends Command {
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '[text to translate]';
  }

  public description(): string {
    return 'Translates text to english.';
  }

  public async run(message: Message, args: string): Promise<Message | Message[]> {
    const guild = message.guild.id;
    const isAdmin = message.member.hasPermission('ADMINISTRATOR');
    const isOwner = this.bot.isOwner(message.member.id);

    if (!isAdmin && !isOwner) return this.onBlock(message, BlockReason.RoleOnly);

    const translation = await this.getTranslation(`${TRANSLATE_URL}?q=${encodeURIComponent(args)}`);
    return message.channel.send(translation.translatedText);
  }

  private getTranslation(url: string): Promise<Translation> {
    const stream = miniget(url);
    const chunks: Uint8Array[] = [];

    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    return new Promise((resolve, reject) => {
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const translation: Translation = JSON.parse(buffer.toString());
        resolve(translation);
      });

      stream.on('error', error => {
        console.log(`An error occurred trying to retrieving: ${url}`);
        reject(error);
      });
    });
  }
}

import { Message } from 'discord.js';
import { MaiBot } from '../mai-bot';
import { BlockReason, Command } from './base';
import miniget = require('miniget');
import iso6391 from 'iso-639-1';

type TranslationError = {
    message: string
};

type Translation = {
  sourceText: string;
  translatedText: string;
  error: TranslationError;
};

const TRANSLATE_URL = 'https://script.google.com/macros/s/AKfycby2Uy7BjXaQm24MNkNmVkTF56EG0sGpVcKZaKlsLlty_0KlrY4/exec';
export class TranslateCommand extends Command {
  private readonly argumentPattern: RegExp = new RegExp('^\\s*\/([^\\s]+)', 'i');
  constructor(bot: MaiBot) {
    super(bot);
  }

  public arguments(): string {
    return '[/language | /code] [text to translate]';
  }

  public description(): string {
    return 'Translates text to english.';
  }

  public async run(message: Message, args: string): Promise<Message | Message[]> {
    const guild = message.guild.id;

    let target = 'en';
    const matches = this.argumentPattern.exec(args || '');

    if (matches && matches.length === 2) {
        if (!iso6391.validate(matches[1])) {
            const code = iso6391.getCode(matches[1]);
            if (!code) return message.channel.send(`:x: No language by the name '${matches[1]}' was found!`);

            target = code;
        } else target = matches[1];

        args = args.substring(matches[0].length).trim();
    }

    if (!args) return message.channel.send(`:x: No text was given to translate!`);

    const query = encodeURIComponent(args);

    const translation = await this.getTranslation(`${TRANSLATE_URL}?q=${query}&target=${target}`);
    if (translation.error) {
        return message.channel.send(`:x: ${translation.error.message}`);
    }

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

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
  private readonly pingPattern: RegExp = new RegExp('<(@|#|\uFF03)[ !&]*\\d+\\s*>', 'gi');
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

    let isPhonetic = false;
    if (matches && matches.length === 2) {
        if (matches[1].toLowerCase() === 'phonetic') {
            isPhonetic = true;
        } else if (!iso6391.validate(matches[1])) {
            const code = iso6391.getCode(matches[1]);
            if (!code) return message.channel.send(`:x: No language by the name '${matches[1]}' was found!`);

            target = code;
        } else target = matches[1];

        args = args.substring(matches[0].length).trim();
    }

    if (!args) return message.channel.send(`:x: No text was given to translate!`);

    const query = encodeURIComponent(args);

    if (!isPhonetic) {
        const translation = await this.getTranslation(`${TRANSLATE_URL}?q=${query}&target=${target}`);
        if (translation.error) {
            return message.channel.send(`:x: ${translation.error.message}`);
        }

        const translatedText = translation.translatedText.replace(this.pingPattern, this.fixTagsInTranslation);

        console.log(translatedText.charCodeAt(1));

        return message.channel.send(translatedText);
    } else {
        const translation = await this.getPhoneticTranslation(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&dt=t&q=${query}`);
        let phoneticText = translation[0][1][3];

        if (phoneticText) {
            phoneticText = phoneticText.replace(this.pingPattern, this.fixTagsInTranslation);

            return message.channel.send(phoneticText);
        }
        return message.channel.send(`:x: Phonetic translation doesn't exist for '${args}'!`);
    }
  }

  private fixTagsInTranslation(match: string) {
      return match.replace(/ /g, '').replace('\uFF03', '#');
  }

  private getPhoneticTranslation(url: string): Promise<any> {
      const stream = miniget(url);
      const chunks: Uint8Array[] = [];

      stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));

      return new Promise((resolve, reject) => {
          stream.on('end', () => {
              const buffer = Buffer.concat(chunks);
              const response = JSON.parse(buffer.toString());
              resolve(response);
          });

          stream.on('error', error => {
              console.log(`An error occurred trying to retrieve: ${url}`);
              reject(error);
          });
      });
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
        console.log(`An error occurred trying to retrieve: ${url}`);
        reject(error);
      });
    });
  }
}

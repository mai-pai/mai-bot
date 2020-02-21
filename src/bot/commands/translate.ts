import { Attachment, Message } from 'discord.js';
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
  private readonly argumentPattern: RegExp = new RegExp('^((?:\\s*\/(?:[^\\s]+))*)', 'i');
  private readonly paramPattern: RegExp = new RegExp('\/([^\\s]+)', 'gi');
  private readonly pingPattern: RegExp = new RegExp('<(@|#)[ !&]*\\d+\\s*>', 'gi');
  private readonly rolePattern: RegExp = new RegExp('<@&?([0-9]+)>', 'gi');
  private readonly channelPattern: RegExp = new RegExp('<#([0-9]+)>', 'gi');
  private readonly userPattern: RegExp = new RegExp('<@!?([0-9]+)>', 'gi');
  private readonly numberSign: RegExp = new RegExp('\uFF03', 'gi');
  private readonly exclamation: RegExp = new RegExp('\uFF01', 'gi');
  private readonly ampersand: RegExp = new RegExp('\uFF06', 'gi');

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
    if (!this.bot.isOwner(message.member.id)) return message;

    let target: string | undefined = undefined;
    const matches = this.argumentPattern.exec(args || '');

    let isPhonetic = false;
    let isTts = false;
    let ttsHasTarget = true;

    if (matches && matches.length === 2) {
      const params = matches[1].match(this.paramPattern);
      if (params && params.length > 2) return message.channel.send(':x: To many parameters!');

      let param: RegExpExecArray | null;// = this.paramPattern.exec(matches[1]);
      while ((param = this.paramPattern.exec(matches[1])) !== null) {
        if (param[1].toLowerCase() === 'tts') {
          isPhonetic = true;
          isTts = true;
        } else if (param[1].toLowerCase() === 'phonetic') {
          isPhonetic = true;
        } else if (!iso6391.validate(param[1])) {
          const code = iso6391.getCode(param[1]);
          if (!code) return message.channel.send(`:x: No language by the name '${param[1]}' was found!`);

          target = code;
        } else if (target) return message.channel.send(`:x: Only one lauguage output is supported at a time.`);
        else target = param[1];
      }

      args = args.substring(matches[0].length).trim();
    }

    if (!args) return message.channel.send(`:x: No text was given to translate!`);
    if (!target) {
      target = 'en';
      ttsHasTarget = false;
    }

    const query = encodeURIComponent(args);

    if (!isPhonetic) {
      const translation = await this.getTranslation(`${TRANSLATE_URL}?q=${query}&target=${target}`);
      if (translation.error) {
        return message.channel.send(`:x: ${translation.error.message}`);
      }

      const translatedText = translation.translatedText.replace(this.numberSign, '#').replace(this.ampersand,'&').replace(this.exclamation, '!').replace(this.pingPattern, this.fixTagsInTranslation);

      return message.channel.send(translatedText);
    } else {
      const payload = await this.getPhoneticTranslation(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=rm&dt=t&q=${query}`);
      const translations = payload[0];
      const phonetic = translations[translations.length-1];
      let phoneticText = phonetic[ttsHasTarget ? 2 : 3];

      if (phoneticText) {
        phoneticText = phoneticText.replace(this.numberSign, '#').replace(this.ampersand,'&').replace(this.exclamation, '!').replace(this.pingPattern, this.fixTagsInTranslation);
        if (!isTts) return message.channel.send(phoneticText);
      }

      if (isTts) {
        const tl = ttsHasTarget ? target : payload[2];
        const q = (ttsHasTarget ? translations[0][0].replace(this.numberSign, '#').replace(this.ampersand,'&').replace(this.exclamation, '!').replace(this.pingPattern, this.fixTagsInTranslation) : args).replace(this.rolePattern, (match: string, roleId: string) => {
          const role = message.guild.roles.find(r => r.id === roleId);
          return role ? role.name : match;
        }).replace(this.channelPattern, (match: string, channelId: string) => {
          const channel = message.guild.channels.find(c => c.id === channelId);
          return channel ? channel.name : match;
        }).replace(this.userPattern, (match: string, userId: string) => {
          const user = message.guild.members.find(m => m.id === userId);
          return user ? user.displayName : match;
        });

        if (!phoneticText) phoneticText = args;

        phoneticText = phoneticText.replace(this.rolePattern, (match: string, roleId: string) => {
          const role = message.guild.roles.find(r => r.id === roleId);
          return role ? role.name : match;
        }).replace(this.channelPattern, (match: string, channelId: string) => {
          const channel = message.guild.channels.find(c => c.id === channelId);
          return channel ? channel.name : match;
        }).replace(this.userPattern, (match: string, userId: string) => {
          const user = message.guild.members.find(m => m.id === userId);
          return user ? user.displayName : match;
        });

        const audio = await this.getTts(`https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&idx=0&tl=${tl}&q=${encodeURIComponent(q)}`);
        const attachment = new Attachment(audio, `${phoneticText.length > 30 ? phoneticText.substring(0, 31) : phoneticText}.mp3`);
        return message.channel.send(attachment);
      }

      return message.channel.send(`:x: Phonetic translation doesn't exist for '${args}'!`);
    }
  }

  private getTts(url: string): Promise<Buffer> {
    const stream = miniget(url);
    const chunks: Uint8Array[] = [];

    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });

      stream.on('error', error => {
        console.log(`An error occurred trying to retrieve: ${url}`);
        reject(error);
      });
    });
  }

  private fixTagsInTranslation(match: string): string {
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

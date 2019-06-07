import { Client, Message, RichEmbed } from 'discord.js';
import miniget = require('miniget');

type Translation = {
  sourceText: string;
  translatedText: string;
};

const TRANSLATE_URL = 'https://script.google.com/macros/s/AKfycby2Uy7BjXaQm24MNkNmVkTF56EG0sGpVcKZaKlsLlty_0KlrY4/exec';
export class TranslateBot {
  constructor(private client: Client) {
    if (this.client.readyTimestamp && this.client.readyTimestamp < Date.now()) this.initialize();
    else
      this.client.once('ready', () => {
        this.initialize();
      });
  }

  private initialize(): void {
    this.client.on('message', async (message: Message) => {
      if (!message.author.bot || message.author.id !== '585808775630553112') return;

      const embed = message.embeds[0];
      if (!embed) return;

      const translation = await this.getTranslation(`${TRANSLATE_URL}?q=${encodeURIComponent(embed.description)}`);
      const newEmbed = new RichEmbed()
        .setAuthor(embed.author.name, embed.author.iconURL, embed.author.url)
        .setURL(embed.url)
        .setDescription(translation.translatedText)
        .setFooter(embed.footer.text, embed.footer.iconURL);

      message.channel.send(message.content, newEmbed);
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
        console.log(`An error occurred trying to retrieving: ${url}`);
        reject(error);
      });
    });
  }
}

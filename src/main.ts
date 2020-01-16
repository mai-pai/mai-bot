import { Client } from 'discord.js';
import { BotConfig } from 'json-types';
import { MaiBot } from './bot/mai-bot';
import { PlecoFish } from './bot/pleco';
import { TranslateBot } from './bot/translate';
import configJson = require('./config.json');

const config = configJson as unknown;
const client = new Client();
const bot = new MaiBot(client, config as BotConfig);
const pleco = new PlecoFish(client, config as BotConfig);
const translator = new TranslateBot(client, config as BotConfig);
bot.start();

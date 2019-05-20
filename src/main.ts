import { MaiBot } from './bot/mai-bot';
import config from './config.json';

const bot = new MaiBot(config);
bot.start();

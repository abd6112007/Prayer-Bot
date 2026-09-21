// سجلّ بسيط بالتوقيت المحلي لغزة.
// تنبيه: سجلات GitHub Actions في المستودعات العامة يراها الجميع،
// لذلك لا نطبع هنا أرقام الهواتف ولا معرّفات المجموعات أبداً.
import { DateTime } from 'luxon';
import { config } from './config.js';

const stamp = () => DateTime.now().setZone(config.timezone).toFormat('yyyy-LL-dd HH:mm:ss');
const write = (level, message) => console.log(`[${stamp()}] ${level.padEnd(5)} ${message}`);

export const log = {
  info: (message) => write('INFO', message),
  warn: (message) => write('WARN', message),
  error: (message) => write('ERROR', message),
};

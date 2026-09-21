// ============================================================
//  adhkar.js — أذكار الصباح والمساء (صورة + نص) في وقت ثابت يومياً بتوقيت غزة
//  لتغيير الوقت عدّل hour / minute. ضع الصورة في نفس المجلد (src/).
// ============================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ADHKAR = [
  {
    key: 'AdhkarMorning',
    name: 'أذكار الصباح',
    hour: 6,
    minute: 30,
    image: path.join(here, 'morning-adhkar.jpg'),
    caption: '*ᥫ᭡أذكار الصباح ᥫ᭡*',
  },
  {
    key: 'AdhkarEvening',
    name: 'أذكار المساء',
    hour: 17,
    minute: 30,
    image: path.join(here, 'evening-adhkar.jpg'),
    caption: '*ᥫ᭡ أذكار المساء  ᥫ᭡*',
  },
];

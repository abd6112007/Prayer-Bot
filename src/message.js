// ============================================================
//  message.js — صياغة رسالة التنبيه (تنسيق واتساب: *غامق* و _مائل_)
// ============================================================
import { config } from './config.js';

// luxon: weekday من 1 (الاثنين) إلى 7 (الأحد)
const WEEKDAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
// أسماء الأشهر المستخدمة في بلاد الشام
const MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

/** أيقونة وآية لكل صلاة (يمكنك تعديلها كما تشاء) */
const STYLE = {
  Fajr: {
    icon: '🌅',
    verse: 'أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ وَقُرْآنَ الْفَجْرِ ۖ إِنَّ قُرْآنَ الْفَجْرِ كَانَ مَشْهُودًا',
    source: 'سورة الإسراء: 78',
  },
  Dhuhr: {
    icon: '☀️',
    verse: 'وَأْمُرْ أَهْلَكَ بِالصَّلَاةِ وَاصْطَبِرْ عَلَيْهَا',
    source: 'سورة طه: 132',
  },
  Asr: {
    icon: '🌤️',
    verse: 'حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَىٰ وَقُومُوا لِلَّهِ قَانِتِينَ',
    source: 'سورة البقرة: 238',
  },
  Maghrib: {
    icon: '🌇',
    verse: 'وَأَقِمِ الصَّلَاةَ طَرَفَيِ النَّهَارِ وَزُلَفًا مِّنَ اللَّيْلِ ۚ إِنَّ الْحَسَنَاتِ يُذْهِبْنَ السَّيِّئَاتِ',
    source: 'سورة هود: 114',
  },
  Isha: {
    icon: '🌙',
    verse: 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا',
    source: 'سورة النساء: 103',
  },
};

/** يعرض الوقت بنظام 12 ساعة مع الفترة، مثال: 4:52 صباحاً */
export function formatTime(dt, prayerKey) {
  const period = prayerKey === 'Dhuhr' ? 'ظهراً' : dt.hour < 12 ? 'صباحاً' : 'مساءً';
  const hour12 = dt.hour % 12 || 12;
  return `${hour12}:${String(dt.minute).padStart(2, '0')} ${period}`;
}

/**
 * يبني نص الرسالة.
 * @param {object} event    {key, name, at}  الصلاة وموعدها
 * @param {object} schedule الجدول (يحوي التاريخ الهجري)
 */
export function buildMessage(event, schedule) {
  const style = STYLE[event.key];
  const { at } = event;
  const hijri = config.showHijri ? schedule.hijri : null;
  const isRamadan = schedule.hijri?.monthNumber === 9;

  const lines = [
    `${style.icon} *حان الآن موعد أذان ${event.name}*`,
    '━━━━━━━━━━━━━━',
    `🕐 *الوقت:* ${formatTime(at, event.key)}`,
    `📍 *المدينة:* ${config.location.name}`,
    `📅 ${WEEKDAYS[at.weekday - 1]}، ${at.day} ${MONTHS[at.month - 1]} ${at.year}م`,
  ];
  if (hijri?.month) lines.push(`🌙 ${hijri.day} ${hijri.month} ${hijri.year}هـ`);

  lines.push('', `﴿ ${style.verse} ﴾`, `_${style.source}_`);

  // لمسات خاصة
  if (event.key === 'Dhuhr' && at.weekday === 5) {
    lines.push('', '🤍 *جمعة مباركة* — وأكثروا من الصلاة على النبي ﷺ');
  }
  if (isRamadan && event.key === 'Maghrib') lines.push('', '🌙 حان وقت الإفطار.. تقبّل الله صيامكم');
  if (isRamadan && event.key === 'Fajr') lines.push('', '🌙 انتهى وقت السحور.. تقبّل الله صيامكم');

  lines.push('', '🤲 _تقبّل الله طاعاتكم، ولا تنسوا الصلاة في وقتها_');
  return lines.join('\n');
}

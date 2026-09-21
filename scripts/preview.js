// ============================================================
//  preview.js — يعرض مواقيت اليوم كما سيحسبها البوت + شكل الرسالة (بدون واتساب)
//  للتحقق من صحة المواقيت ومقارنتها بجدول وزارة الأوقاف / مسجد حيّك.
//  الاستخدام:  npm run preview            (يعرض رسالة الظهر)
//              npm run preview -- Maghrib (أو Fajr / Asr / Isha)
// ============================================================
import { config } from '../src/config.js';
import { buildMessage } from '../src/message.js';
import { PRAYERS, fetchSchedule, startOfTodayInGaza } from '../src/prayerTimes.js';

const wanted = process.argv[2] ?? 'Dhuhr';
const schedule = await fetchSchedule(startOfTodayInGaza());

console.log(`\n📅 ${schedule.dateISO} — ${config.location.name} (${config.timezone})`);
console.log(`طريقة الحساب: ${config.calc.method} | المذهب: ${config.calc.school} | التعديل: ${config.calc.tune}\n`);
for (const event of schedule.events) console.log(`  ${event.name.padEnd(8)} ${event.at.toFormat('HH:mm')}`);

const event = schedule.events.find((e) => e.key.toLowerCase() === wanted.toLowerCase());
if (!event) {
  console.error(`\nاسم صلاة غير معروف. الخيارات: ${PRAYERS.map((p) => p.key).join(', ')}`);
  process.exit(1);
}
console.log(`\n————— شكل رسالة ${event.name} —————\n${buildMessage(event, schedule)}\n`);

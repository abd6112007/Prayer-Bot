// ============================================================
//  prayerTimes.js — جلب مواقيت الصلاة من Aladhan API (مجاني، بلا مفتاح)
//  التوثيق: https://aladhan.com/prayer-times-api
// ============================================================
import { DateTime } from 'luxon';
import { config } from './config.js';
import { log } from './logger.js';
import { sleep } from './utils.js';

/** الصلوات الخمس بالترتيب. key = الاسم كما يعيده Aladhan */
export const PRAYERS = [
  { key: 'Fajr', ar: 'الفجر' },
  { key: 'Dhuhr', ar: 'الظهر' },
  { key: 'Asr', ar: 'العصر' },
  { key: 'Maghrib', ar: 'المغرب' },
  { key: 'Isha', ar: 'العشاء' },
];

const API_BASE = 'https://api.aladhan.com/v1/timings';

/** بداية اليوم الحالي بتوقيت غزة */
export const startOfTodayInGaza = () => DateTime.now().setZone(config.timezone).startOf('day');

/** يبني رابط الطلب ليوم محدد */
export function buildUrl(day) {
  const params = new URLSearchParams({
    latitude: config.location.latitude,
    longitude: config.location.longitude,
    method: config.calc.method,
    school: config.calc.school,
    tune: config.calc.tune,
    adjustment: config.calc.hijriAdjustment,
    // نطلب الأوقات بتوقيت غزة مباشرة (يشمل التوقيت الصيفي/الشتوي)
    timezonestring: config.timezone,
  });
  return `${API_BASE}/${day.toFormat('dd-LL-yyyy')}?${params}`;
}

/** طلب HTTP مع مهلة وإعادة محاولة بتأخير متزايد */
async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        const wait = 2000 * 2 ** (i - 1);
        log.warn(`تعذّر جلب المواقيت (محاولة ${i}/${attempts}): ${error.message} — سنعيد بعد ${wait / 1000}ث`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`تعذّر الوصول إلى Aladhan API: ${lastError?.message}`);
}

/**
 * يحوّل استجابة Aladhan إلى جدول مواعيد جاهز.
 * (دالة "نقية" منفصلة لتسهيل الاختبار بدون إنترنت)
 * @param {object} json  الاستجابة الخام
 * @param {DateTime} day بداية اليوم بتوقيت غزة
 */
export function parseSchedule(json, day) {
  if (json?.code !== 200 || !json?.data?.timings) {
    throw new Error('استجابة غير متوقعة من Aladhan API');
  }
  const { timings, date } = json.data;
  const dateISO = day.toFormat('yyyy-LL-dd');

  const events = PRAYERS.map(({ key, ar }) => {
    // القيمة تكون عادة "04:52" وأحياناً "04:52 (EET)" — نأخذ الساعة والدقيقة فقط
    const match = /(\d{1,2}):(\d{2})/.exec(timings[key] ?? '');
    if (!match) throw new Error(`تعذّر قراءة وقت ${ar}: "${timings[key]}"`);
    const at = day.set({ hour: Number(match[1]), minute: Number(match[2]), second: 0, millisecond: 0 });
    return { id: `${dateISO}_${key}`, key, name: ar, at, dateISO };
  });

  // فحص سلامة: يجب أن تكون الصلوات مرتّبة زمنياً
  for (let i = 1; i < events.length; i++) {
    if (events[i].at <= events[i - 1].at) {
      throw new Error(`ترتيب المواقيت غير منطقي (${events[i - 1].name} / ${events[i].name}) — لن نستخدمه`);
    }
  }

  const h = date?.hijri;
  const hijri = h
    ? { day: Number(h.day), month: h.month?.ar, monthNumber: Number(h.month?.number), year: h.year }
    : null;

  return { dateISO, events, hijri };
}

/** يجلب جدول يوم كامل */
export async function fetchSchedule(day) {
  return parseSchedule(await fetchJson(buildUrl(day)), day);
}

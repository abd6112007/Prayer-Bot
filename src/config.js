// ============================================================
//  config.js — كل الإعدادات في مكان واحد
//  تُقرأ القيم من متغيّرات البيئة:
//    • محلياً: من ملف .env
//    • على GitHub: من Secrets / Variables (انظر ملف الـ workflow)
// ============================================================
import { join } from 'node:path';

// تحميل ملف .env إن وُجد (للتشغيل على جهازك فقط). متاح في Node 20.12+
try {
  process.loadEnvFile();
} catch {
  /* لا يوجد ملف .env — لا مشكلة، سنقرأ من متغيرات البيئة مباشرة */
}

/** يقرأ نصاً من البيئة ويعيد القيمة الافتراضية إن كان فارغاً/غير موجود */
function readString(name, fallback = '') {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value.trim() : fallback;
}

/** يقرأ رقماً من البيئة (مع التحقق من صحته) */
function readNumber(name, fallback) {
  const raw = readString(name);
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`قيمة غير صالحة للمتغير ${name}: "${raw}"`);
  return value;
}

/** يقرأ قيمة منطقية: 1 / true / yes / on */
function readBool(name, fallback = false) {
  const raw = readString(name).toLowerCase();
  return raw === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(raw);
}

// ---- معرّفات المجموعات: قائمة مفصولة بفاصلة أو سطر جديد ----
const groupIds = readString('GROUP_IDS')
  .split(/[\s,;]+/)
  .filter(Boolean);

for (const id of groupIds) {
  if (!/^[\d-]+@g\.us$/.test(id)) {
    throw new Error(`معرّف مجموعة غير صالح في GROUP_IDS (يجب أن ينتهي بـ @g.us): "${id.slice(0, 6)}…"`);
  }
}

// ---- تعديلات المواقيت: 9 أرقام (الإمساك،الفجر،الشروق،الظهر،العصر،المغرب،الغروب،العشاء،منتصف الليل) ----
const tune = readString('PRAYER_TUNE', '0,0,0,0,0,0,0,0,0');
if (!/^-?\d+(,-?\d+){8}$/.test(tune)) {
  throw new Error('PRAYER_TUNE يجب أن يحوي 9 أرقام مفصولة بفواصل، مثال: 0,0,0,0,0,0,0,0,0');
}

const dataDir = readString('DATA_DIR', 'data');

export const config = {
  /** المنطقة الزمنية المستخدمة في كل الحسابات (تتعامل مع التوقيت الصيفي تلقائياً) */
  timezone: readString('TIMEZONE', 'Asia/Gaza'),

  /** الموقع: مدينة غزة */
  location: {
    name: readString('CITY_NAME', 'غزة، فلسطين'),
    latitude: readNumber('LATITUDE', 31.5017),
    longitude: readNumber('LONGITUDE', 34.4668),
  },

  /** إعدادات حساب المواقيت في Aladhan API */
  calc: {
    method: readNumber('PRAYER_METHOD', 5), // 5 = الهيئة المصرية العامة للمساحة
    school: readNumber('PRAYER_SCHOOL', 0), // 0 = جمهور، 1 = حنفي (يؤثر على العصر فقط)
    tune,
    hijriAdjustment: readNumber('HIJRI_ADJUSTMENT', 0),
  },

  showHijri: readBool('SHOW_HIJRI', true),

  /** رسالة الترحيب: تُرسل مرة واحدة لكل مجموعة. لإعادة إرسالها للجميع غيّر version (مثلاً إلى 2) */
  welcome: {
    enabled: readBool('SEND_WELCOME', true),
    version: readString('WELCOME_VERSION', '1'),
  },

  /** إن بقي واتساب غير متصل أكثر من هذه المدة (دقائق) تنتهي النسخة بخطأ واضح بدل أن تعلق */
  disconnectLimitMinutes: readNumber('DISCONNECT_LIMIT_MINUTES', 10),

  /** المجموعات المسموح الإرسال إليها — لا يُرسل البوت لأي جهة غيرها */
  groupIds,

  dataDir,

  /** مدة تشغيل النسخة الواحدة بالدقائق (0 = بلا حدّ، للتشغيل المحلي). على GitHub تُضبط ~335 */
  runMinutes: readNumber('RUN_MINUTES', 0),

  /** إن فات موعد الصلاة بأكثر من هذه المدة (دقائق) لا نرسل التنبيه بعد ذلك */
  lateGraceMinutes: readNumber('LATE_GRACE_MINUTES', 15),

  /** وضع التجربة: لا اتصال بواتساب، فقط يطبع الرسائل في الشاشة */
  dryRun: readBool('DRY_RUN') || process.argv.includes('--dry-run'),

  /** كلمة سر تشفير الجلسة (تُستخدم في scripts/session.js فقط) */
  sessionPassphrase: readString('SESSION_PASSPHRASE'),

  /** مستوى سجلات مكتبة Baileys: silent | info | debug */
  waLogLevel: readString('WA_LOG_LEVEL', 'silent'),
};

export const paths = {
  dataDir,
  /** مجلد جلسة واتساب (creds + المفاتيح) */
  authDir: join(dataDir, 'auth'),
  /** ملف يحفظ ما أُرسل فعلاً لتجنّب التكرار بين نسخ التشغيل المتعاقبة */
  stateFile: join(dataDir, 'state.json'),
};

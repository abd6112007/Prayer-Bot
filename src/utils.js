// أدوات مساعدة صغيرة

/** أكواد خروج البرنامج — يقرأها الـ workflow لتحديد ما يجب فعله */
export const EXIT = {
  OK: 0, //          انتهت مدة النسخة بشكل طبيعي → يبدأ الـ workflow نسخة جديدة
  ERROR: 1, //       خطأ عام
  LOGGED_OUT: 2, //  الجلسة لم تعد صالحة → تحتاج ربطاً جديداً (QR)
  REPLACED: 3, //    نسخة أخرى تستخدم نفس الجلسة (تعارض)
  FORBIDDEN: 4, //   الحساب مقيّد من واتساب
  NO_CONNECTION: 5, // لم ينجح الاتصال بواتساب لفترة طويلة → ننهي النسخة بدل أن تعلق ساعات
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** يحوّل معرّف مثل 97059xxxx:12@s.whatsapp.net إلى 97059xxxx (للمقارنة فقط) */
export const bareJid = (jid = '') => String(jid).split('@')[0].split(':')[0];

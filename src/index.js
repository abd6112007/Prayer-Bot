// ============================================================
//  index.js — نقطة تشغيل البوت
//
//  دورة الحياة على GitHub Actions:
//   1) يبدأ الـ workflow → يفك تشفير الجلسة → يشغّل هذا الملف
//   2) يبقى البوت متصلاً ~5 ساعات و35 دقيقة (حدّ GitHub هو 6 ساعات للـ job)
//      ويرسل تنبيه كل صلاة/أذكار في موعدها بالضبط
//   3) يخرج بكود 0 → يحفظ الـ workflow الجلسة مشفّرة ثم يشغّل النسخة التالية
// ============================================================
import { config, paths } from './config.js';
import { log } from './logger.js';
import { createScheduler } from './scheduler.js';
import { loadState } from './state.js';
import { WELCOME_MESSAGE } from './welcome.js';
import { createWhatsAppClient } from './whatsapp.js';
import { EXIT, sleep } from './utils.js';

const HEARTBEAT_MS = 30 * 60_000; //  رسالة "أنا أعمل" في السجل كل نصف ساعة
const HOLD_BEFORE_EVENT_MS = 4 * 60_000; // لا ننهي النسخة إن كان هناك موعد خلال 4 دقائق
const EXTRA_TIME_LIMIT_MS = 8 * 60_000; //   أقصى تمديد لإكمال تنبيه قريب

async function main() {
  const dryRun = config.dryRun;
  const groupIds = config.groupIds.length > 0 ? config.groupIds : dryRun ? ['dry-run@g.us'] : [];
  if (groupIds.length === 0) {
    log.error('لم تُحدَّد أي مجموعة. عيّن المتغير GROUP_IDS (احصل عليها بالأمر: npm run groups)');
    process.exit(EXIT.ERROR);
  }

  const state = loadState({ persist: !dryRun });
  let wa = null;
  let closing = false;

  /** إغلاق نظيف: حفظ الحالة، إغلاق واتساب، ثم الخروج بالكود المناسب */
  async function shutdown(code, reason) {
    if (closing) return;
    closing = true;
    if (reason) log.info(reason);
    state.prune();
    state.save();
    await wa?.stop();
    process.exit(code);
  }

  process.on('SIGINT', () => shutdown(EXIT.OK, 'تلقّيت إشارة إيقاف (SIGINT)'));
  process.on('SIGTERM', () => shutdown(EXIT.OK, 'تلقّيت إشارة إيقاف (SIGTERM)'));

  if (dryRun) {
    log.info('🧪 وضع التجربة: لن يتم الاتصال بواتساب، ستُطبع الرسائل هنا فقط');
  } else {
    wa = createWhatsAppClient({
      authDir: paths.authDir,
      onFatal: (reason, code) => {
        log.error(reason);
        shutdown(code);
      },
    });
    await wa.start();
    log.info('⏳ جاري الاتصال بواتساب...');
  }

  const scheduler = createScheduler({
    state,
    groupIds,
    welcomeText: config.welcome.enabled ? WELCOME_MESSAGE : null,
    isReady: () => dryRun || wa.isReady(),
    sendText: dryRun
      ? async (jid, text) => console.log(`\n----- [تجربة] رسالة إلى ${jid} -----\n${text}\n-----\n`)
      : (jid, text) => wa.sendText(jid, text),
    // ⚠️ كان هذا السطر مفقوداً: بدونه تُرسل الأذكار كنص فقط بلا صورة
    sendImage: dryRun
      ? async (jid, image, caption) => console.log(`\n----- [تجربة] صورة ${image} إلى ${jid} -----\n${caption}\n-----\n`)
      : (jid, image, caption) => wa.sendImage(jid, image, caption),
  });

  const deadline = config.runMinutes > 0 ? Date.now() + config.runMinutes * 60_000 : Infinity;
  const hardDeadline = deadline + EXTRA_TIME_LIMIT_MS;
  const disconnectLimitMs = config.disconnectLimitMinutes * 60_000;
  let lastBeat = 0;
  let lastConnectedAt = Date.now(); // آخر لحظة كان فيها واتساب متصلاً (أو لحظة البدء)
  let connectionFailed = false;

  log.info(
    `🚀 بدأ البوت — عدد المجموعات: ${groupIds.length}` +
      (deadline === Infinity ? ' — يعمل بلا حدّ زمني' : ` — سيعمل ${config.runMinutes} دقيقة ثم يسلّم النسخة التالية`),
  );

  // ---- الحلقة الرئيسية ----
  while (!closing) {
    let info = { pending: false, next: null };
    try {
      info = await scheduler.tick();
    } catch (error) {
      log.error(`خطأ غير متوقع: ${error.stack ?? error}`);
    }

    const nowMs = Date.now();
    const nextMs = info.next ? info.next.at.toMillis() : null;
    const connected = dryRun || wa.isReady();
    if (connected) lastConnectedAt = nowMs;

    // حارس الاتصال: إن تعذّر الاتصال مدة طويلة ننهي النسخة بخطأ واضح
    // (بدل أن تبقى معلّقة 6 ساعات دون أن يلاحظ أحد). راجع سطور "انقطع الاتصال (كود: …)" أعلاه.
    if (!connected && nowMs - lastConnectedAt > disconnectLimitMs) {
      log.error(`تعذّر الاتصال بواتساب منذ ${config.disconnectLimitMinutes} دقائق — راجع أكواد "انقطع الاتصال" في السجل`);
      connectionFailed = true;
      break;
    }

    if (nowMs - lastBeat >= HEARTBEAT_MS) {
      lastBeat = nowMs;
      const nextText = info.next
        ? `الموعد القادم: ${info.next.name} الساعة ${info.next.at.toFormat('HH:mm')}`
        : 'لا موعد قادم في الجدول المحمّل';
      log.info(`💓 يعمل — واتساب: ${dryRun ? 'وضع التجربة' : connected ? 'متصل' : 'غير متصل'} — ${nextText}`);
    }

    // انتهت مدة النسخة؟ لا ننهيها إن كان تنبيه قيد الإرسال أو موعد على وشك الحلول
    if (nowMs >= deadline) {
      const busy = info.pending || (nextMs !== null && nextMs - nowMs < HOLD_BEFORE_EVENT_MS);
      if (!busy || nowMs >= hardDeadline) break;
    }

    // ننام 5 ثوانٍ كحدّ أقصى، أو أقل إن كان الموعد أقرب (لدقة الإرسال)
    await sleep(nextMs === null ? 5000 : Math.min(5000, Math.max(250, nextMs - nowMs)));
  }

  await shutdown(
    connectionFailed ? EXIT.NO_CONNECTION : EXIT.OK,
    connectionFailed ? undefined : '⏱️ انتهت مدة هذه النسخة — سيبدأ الـ workflow النسخة التالية',
  );
}

main().catch((error) => {
  log.error(`فشل تشغيل البوت: ${error.stack ?? error}`);
  process.exit(EXIT.ERROR);
});

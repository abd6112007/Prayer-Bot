// ============================================================
//  scheduler.js — قلب البوت: يقرّر متى وماذا يُرسل
//
//  المواعيد نوعان، ويُعاملان بنفس المنطق (مهلة تأخير، منع تكرار، إعادة محاولة):
//   • الصلوات الخمس: تُجلب مواقيتها كل يوم من Aladhan API
//   • الأذكار (صباحاً ومساءً): وقت ثابت تحدده في adhkar.js، وتُرسل مع صورة
//  + رسالة الترحيب: مرة واحدة فقط لكل مجموعة.
//
//  دالة tick() تُستدعى كل بضع ثوانٍ؛ هذا أدق وأمتن من setTimeout الطويل
//  (لا يتأثر بانقطاع الاتصال أو تغيّر الساعة).
// ============================================================
import { DateTime } from 'luxon';
import { ADHKAR } from './adhkar.js';
import { config } from './config.js';
import { log } from './logger.js';
import { buildMessage } from './message.js';
import { fetchSchedule } from './prayerTimes.js';
import { sleep } from './utils.js';

export function createScheduler({
  state,
  isReady,
  sendText,
  sendImage = null, //   (jid, مسار الصورة, النص) — إن لم تُمرَّر تُرسل الأذكار كنص فقط
  welcomeText = null, // نص الترحيب (null = بلا ترحيب)
  groupIds = config.groupIds,
  graceMs = config.lateGraceMinutes * 60_000,
  now = () => DateTime.now().setZone(config.timezone),
  loadDay = fetchSchedule,
  adhkar = ADHKAR,
  pauseBetweenGroups = () => 1500 + Math.random() * 2000, // فاصل عشوائي بين المجموعات (أسلم للحساب)
}) {
  const clock = () => now().toMillis();
  const schedules = new Map(); //  'yyyy-LL-dd' → جدول اليوم
  const retryAt = new Map(); //    مفتاح الإرسال → أقرب وقت لإعادة المحاولة
  const reported = new Set(); //   لتجنّب تكرار نفس رسالة السجل
  let nextRefreshAt = 0;

  /** رقم المجموعة في القائمة (بدل المعرّف نفسه) لأن سجلات GitHub Actions قد تكون عامة */
  const label = (jid) => `#${groupIds.indexOf(jid) + 1}`;
  const once = (key, fn) => {
    if (!reported.has(key)) {
      reported.add(key);
      fn();
    }
  };

  /** يضمن وجود جدول اليوم والغد، ويحذف الأيام القديمة */
  async function refreshSchedules(today) {
    const oldest = today.minus({ days: 1 }).toFormat('yyyy-LL-dd');
    for (const dateISO of schedules.keys()) if (dateISO < oldest) schedules.delete(dateISO);

    const missing = [today, today.plus({ days: 1 })].filter((d) => !schedules.has(d.toFormat('yyyy-LL-dd')));
    if (missing.length === 0 || clock() < nextRefreshAt) return;

    for (const day of missing) {
      try {
        const schedule = await loadDay(day);
        schedules.set(schedule.dateISO, schedule);
        const summary = schedule.events.map((e) => `${e.name} ${e.at.toFormat('HH:mm')}`).join(' | ');
        log.info(`📅 مواقيت ${schedule.dateISO}: ${summary}`);
      } catch (error) {
        log.error(`فشل جلب مواقيت ${day.toFormat('yyyy-LL-dd')}: ${error.message}`);
        nextRefreshAt = clock() + 60_000; // نعيد المحاولة بعد دقيقة
        return;
      }
    }
  }

  /** مواعيد الأذكار لنفس يوم الجدول (بنفس شكل مواعيد الصلوات) */
  function adhkarEvents(schedule) {
    const day = schedule.events[0].at.startOf('day');
    return adhkar.map((a) => ({
      id: `${schedule.dateISO}_${a.key}`, // يبدأ بالتاريخ → يُنظَّف تلقائياً بعد 3 أيام
      key: a.key,
      name: a.name,
      at: day.set({ hour: a.hour, minute: a.minute, second: 0, millisecond: 0 }),
      dateISO: schedule.dateISO,
      image: a.image,
      caption: a.caption,
    }));
  }

  /** يرسل صورة الأذكار مع النص؛ وإن تعذّرت الصورة يرسل النص وحده حتى لا يضيع التذكير */
  async function sendEvent(jid, event, text) {
    if (event.image && sendImage) {
      try {
        return await sendImage(jid, event.image, text);
      } catch (error) {
        log.warn(`تعذّر إرسال صورة ${event.name} (${error.message}) — سنرسل النص فقط`);
      }
    }
    return sendText(jid, text);
  }

  /** يرسل موعداً واحداً إلى المجموعات المتبقية. يعيد عدد ما فشل/تأجّل */
  async function deliver(event, schedule, jids, lateSeconds) {
    const text = event.caption ?? buildMessage(event, schedule);
    let remaining = 0;
    let sentAny = false;

    for (const jid of jids) {
      const key = `${event.id}@${jid}`;
      if ((retryAt.get(key) ?? 0) > clock()) {
        remaining++;
        continue;
      }
      try {
        if (sentAny) await sleep(pauseBetweenGroups());
        await sendEvent(jid, event, text);
        sentAny = true;
        state.mark(key);
        log.info(`📨 أُرسل ${event.name} إلى المجموعة ${label(jid)} (بعد الموعد بـ ${lateSeconds}ث)`);
      } catch (error) {
        remaining++;
        retryAt.set(key, clock() + 30_000);
        log.error(`فشل الإرسال إلى المجموعة ${label(jid)}: ${error.message} — سنعيد المحاولة بعد 30ث`);
      }
    }
    return remaining;
  }

  /** رسالة الترحيب: تُرسل مرة واحدة فقط لكل مجموعة (يُسجَّل ذلك في state.json) */
  async function sendWelcomes() {
    if (!welcomeText || !isReady()) return;
    let sentAny = false;
    for (const jid of groupIds) {
      const key = `welcome-v${config.welcome.version}@${jid}`;
      if (state.has(key) || (retryAt.get(key) ?? 0) > clock()) continue;
      try {
        if (sentAny) await sleep(pauseBetweenGroups());
        await sendText(jid, welcomeText);
        sentAny = true;
        state.mark(key);
        log.info(`👋 أُرسلت رسالة الترحيب إلى المجموعة ${label(jid)}`);
      } catch (error) {
        retryAt.set(key, clock() + 30_000);
        log.error(`فشل إرسال الترحيب إلى المجموعة ${label(jid)}: ${error.message} — سنعيد المحاولة بعد 30ث`);
      }
    }
  }

  /**
   * تُستدعى بشكل متكرر. تعيد:
   *   pending: هل هناك موعد حان ولم يكتمل إرساله؟
   *   next:    الموعد القادم (صلاة أو أذكار) لتحديد مدة الانتظار
   */
  async function tick() {
    const current = now();
    await refreshSchedules(current.startOf('day'));

    const nowMs = current.toMillis();
    const events = [...schedules.values()]
      .flatMap((schedule) => [...schedule.events, ...adhkarEvents(schedule)].map((event) => ({ event, schedule })))
      .sort((a, b) => a.event.at - b.event.at);

    let pending = false;
    let next = null;

    for (const { event, schedule } of events) {
      const late = nowMs - event.at.toMillis();

      if (late < 0) {
        next ??= event;
        continue;
      }

      const todo = groupIds.filter((jid) => !state.has(`${event.id}@${jid}`));
      if (todo.length === 0) continue; // أُرسل لكل المجموعات (أو سبق تخطّيه)

      if (late > graceMs) {
        // فات الموعد بأكثر من المهلة: لا نرسل تنبيهاً متأخراً، ونسجّل ذلك حتى لا نعيد فحصه
        log.warn(`⏭️ فات موعد ${event.name} (${event.dateISO}) بأكثر من ${config.lateGraceMinutes} دقيقة — تم التخطي`);
        for (const jid of todo) state.mark(`${event.id}@${jid}`, 'skipped');
        continue;
      }

      if (!isReady()) {
        pending = true;
        once(`waiting:${event.id}`, () => log.warn(`⏳ حان موعد ${event.name} لكن الاتصال غير جاهز — ننتظر`));
        continue;
      }
      const remaining = await deliver(event, schedule, todo, Math.round(late / 1000));
      if (remaining > 0) pending = true;
    }

    // الترحيب بعد المواعيد، حتى لا يؤخّر تنبيهاً حان وقته
    await sendWelcomes();

    return { pending, next };
  }

  return { tick };
}

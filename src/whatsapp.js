// ============================================================
//  whatsapp.js — غلاف بسيط حول مكتبة Baileys
//  • يدير الاتصال وإعادة الاتصال تلقائياً
//  • يميّز الأخطاء القاتلة (تسجيل الخروج، تعارض الجلسات) ويبلّغ عنها
//  • يوفّر sendText() و sendImage() للإرسال
// ============================================================
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { config } from './config.js';
import { log } from './logger.js';
import { EXIT, sleep } from './utils.js';

/**
 * @param {object}   options
 * @param {string}   options.authDir  مجلد حفظ الجلسة
 * @param {Function} [options.onQR]   تُستدعى برمز QR الجديد (للربط الأول فقط)
 * @param {Function} [options.onFatal] تُستدعى (السبب، كود الخروج) عند خطأ لا يمكن التعافي منه
 */
export function createWhatsAppClient({ authDir, onQR, onFatal }) {
  const logger = pino({ level: config.waLogLevel });
  const sentCache = new Map(); // رسائل أُرسلت مؤخراً، تطلبها المكتبة عند إعادة الإرسال للمستلمين
  let sock = null;
  let ready = false;
  let stopped = false;
  let retries = 0;
  let waiters = [];
  let fatalRaised = false;

  const raiseFatal = (reason, code) => {
    if (fatalRaised) return;
    fatalRaised = true;
    onFatal?.(reason, code);
  };

  /** ينشئ اتصالاً جديداً (يُستدعى عند البدء وعند كل إعادة اتصال) */
  async function connect() {
    if (stopped) return;

    // مجلد الجلسة: creds.json + مفاتيح التشفير. تُحفظ تلقائياً عند كل تحديث
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // آخر إصدار من واجهة واتساب ويب (لا ترمي أخطاء؛ تعيد الافتراضي عند الفشل)
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      logger,
      browser: Browsers.ubuntu('Prayer Bot'),
      markOnlineOnConnect: false, // لا نُظهر "متصل" حتى تصل إشعارات الهاتف كالمعتاد
      syncFullHistory: false, //     لا نحمّل سجل المحادثات القديم
      generateHighQualityLinkPreview: false,
      getMessage: async (key) => sentCache.get(key.id),
    });
    sock = socket;

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => onConnectionUpdate(socket, update));
  }

  function onConnectionUpdate(socket, { connection, lastDisconnect, qr }) {
    if (socket !== sock) return; // حدث قادم من اتصال قديم

    // ---- طُلب رمز QR ----
    if (qr) {
      if (onQR) onQR(qr);
      else raiseFatal('الجلسة غير مسجّلة أو انتهت صلاحيتها (طلب واتساب رمز QR). أعد الربط بـ npm run login', EXIT.LOGGED_OUT);
    }

    // ---- الاتصال ناجح ----
    if (connection === 'open') {
      ready = true;
      retries = 0;
      log.info('✅ متصل بواتساب');
      waiters.forEach((resolve) => resolve());
      waiters = [];
    }

    // ---- انقطع الاتصال ----
    if (connection === 'close') {
      ready = false;
      if (stopped) return;

      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        return raiseFatal('تم تسجيل الخروج من الجهاز المرتبط (الجلسة لم تعد صالحة). أعد الربط بـ npm run login', EXIT.LOGGED_OUT);
      }
      if (code === DisconnectReason.connectionReplaced) {
        return raiseFatal('تعارض: نسخة أخرى من البوت تستخدم نفس الجلسة الآن', EXIT.REPLACED);
      }
      if (code === DisconnectReason.forbidden) {
        return raiseFatal('واتساب رفض الاتصال (403) — قد يكون الحساب مقيّداً', EXIT.FORBIDDEN);
      }

      // باقي الحالات مؤقتة: نعيد الاتصال بتأخير متزايد (حتى 30 ثانية)
      // 515 (restartRequired) طبيعي بعد مسح QR مباشرة
      const delay = code === DisconnectReason.restartRequired ? 1000 : Math.min(30_000, 2000 * 2 ** retries++);
      log.warn(`انقطع الاتصال (كود: ${code ?? 'غير معروف'}) — إعادة المحاولة بعد ${delay / 1000}ث`);
      setTimeout(() => {
        connect().catch((error) => {
          log.error(`فشلت إعادة الاتصال: ${error.message}`);
          onConnectionUpdate(socket, { connection: 'close', lastDisconnect: { error } });
        });
      }, delay);
    }
  }

  return {
    /** يبدأ الاتصال (لا ينتظر اكتماله — استخدم waitUntilReady) */
    start: connect,

    isReady: () => ready,
    getSocket: () => sock,

    /** ينتظر حتى يصبح الاتصال جاهزاً */
    waitUntilReady(timeoutMs = 120_000) {
      if (ready) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('انتهت مهلة انتظار الاتصال بواتساب')), timeoutMs);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },

    /** يرسل رسالة نصية إلى معرّف (مجموعة أو شخص) */
    async sendText(jid, text) {
      if (!ready || !sock) throw new Error('غير متصل بواتساب');
      const sent = await sock.sendMessage(jid, { text });
      if (sent?.key?.id && sent.message) {
        sentCache.set(sent.key.id, sent.message);
        if (sentCache.size > 200) sentCache.delete(sentCache.keys().next().value);
      }
      return sent;
    },

    /** يرسل صورة مع نص إلى معرّف (مجموعة أو شخص) */
    async sendImage(jid, imagePath, caption) {
      if (!ready || !sock) throw new Error('غير متصل بواتساب');
      const sent = await sock.sendMessage(jid, { image: { url: imagePath }, caption });
      if (sent?.key?.id && sent.message) {
        sentCache.set(sent.key.id, sent.message);
        if (sentCache.size > 200) sentCache.delete(sentCache.keys().next().value);
      }
      return sent;
    },

    /** يغلق الاتصال بهدوء بعد إعطاء المكتبة فرصة لكتابة المفاتيح على القرص */
    async stop() {
      stopped = true;
      ready = false;
      await sleep(2000);
      try {
        await sock?.end(undefined);
      } catch {
        /* لا يهم */
      }
      await sleep(300);
    },
  };
}
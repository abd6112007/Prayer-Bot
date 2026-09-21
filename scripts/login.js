// ============================================================
//  login.js — الربط الأول: يعرض رمز QR في الطرفية لتمسحه بهاتف رقم البوت
//  الاستخدام:  npm run login
// ============================================================
import qrcode from 'qrcode-terminal';
import { config, paths } from '../src/config.js';
import { EXIT, sleep } from '../src/utils.js';
import { createWhatsAppClient } from '../src/whatsapp.js';

console.log('🔐 ربط رقم البوت بواتساب');
console.log('على هاتف رقم البوت: واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الرمز:\n');

const wa = createWhatsAppClient({
  authDir: paths.authDir,
  onQR: (qr) => {
    console.log('\n— رمز جديد (يتجدد كل نحو 20 ثانية) —');
    qrcode.generate(qr, { small: true });
  },
  onFatal: (reason, code) => {
    console.error(`\n❌ ${reason}`);
    if (code === EXIT.LOGGED_OUT) console.error(`إن كانت هناك جلسة قديمة تالفة فاحذف المجلد ${config.dataDir}/ وأعد المحاولة.`);
    process.exit(code);
  },
});

await wa.start();
await wa.waitUntilReady(10 * 60_000); // نمهلك 10 دقائق للمسح

console.log(`\n✅ تم الربط بنجاح بالرقم: ${wa.getSocket().user?.id}`);
console.log('⏳ ننتظر 20 ثانية لإكمال مزامنة المفاتيح وحفظها (لا تغلق النافذة)...');
await sleep(20_000);
await wa.stop();
console.log(`\n✔ تم حفظ الجلسة في ${config.dataDir}/auth`);
console.log('الخطوة التالية:  npm run groups');
process.exit(0);

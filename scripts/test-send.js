// ============================================================
//  test-send.js — يرسل رسالة تجريبية للمجموعات المحددة في GROUP_IDS
//  للتأكد أن المعرّفات صحيحة وأن البوت يستطيع الإرسال.
//  الاستخدام:  npm run test-send
// ============================================================
import { config, paths } from '../src/config.js';
import { EXIT, sleep } from '../src/utils.js';
import { createWhatsAppClient } from '../src/whatsapp.js';

if (config.groupIds.length === 0) {
  console.error('❌ GROUP_IDS فارغ. شغّل npm run groups ثم ضع المعرّفات في ملف .env');
  process.exit(EXIT.ERROR);
}

const wa = createWhatsAppClient({
  authDir: paths.authDir,
  onFatal: (reason, code) => {
    console.error(`❌ ${reason}`);
    process.exit(code);
  },
});

await wa.start();
await wa.waitUntilReady();

const text = '✅ *رسالة تجريبية*\nبوت مواقيت الصلاة جاهز للعمل بإذن الله 🕌';
let failures = 0;
for (const [index, jid] of config.groupIds.entries()) {
  try {
    await wa.sendText(jid, text);
    console.log(`✔ أُرسلت إلى المجموعة #${index + 1}`);
  } catch (error) {
    failures++;
    console.error(`✘ فشل الإرسال إلى المجموعة #${index + 1}: ${error.message}`);
  }
  await sleep(2500);
}

await wa.stop();
process.exit(failures ? EXIT.ERROR : EXIT.OK);

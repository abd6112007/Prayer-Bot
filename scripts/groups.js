// ============================================================
//  groups.js — يعرض كل المجموعات التي يشترك فيها رقم البوت مع معرّف (ID) كل منها
//  الاستخدام:  npm run groups
// ============================================================
import { paths } from '../src/config.js';
import { EXIT, bareJid } from '../src/utils.js';
import { createWhatsAppClient } from '../src/whatsapp.js';

const wa = createWhatsAppClient({
  authDir: paths.authDir,
  // بدون onQR: إن لم توجد جلسة صالحة يُبلَّغ بخطأ بدل عرض QR
  onFatal: (reason, code) => {
    console.error(`❌ ${reason}`);
    process.exit(code === EXIT.LOGGED_OUT ? code : EXIT.ERROR);
  },
});

await wa.start();
await wa.waitUntilReady();
const sock = wa.getSocket();

const groups = Object.values(await sock.groupFetchAllParticipating()).sort((a, b) =>
  (a.subject ?? '').localeCompare(b.subject ?? '', 'ar'),
);

// هوية البوت (رقم الهاتف و/أو LID) لمعرفة إن كان مشرفاً
const me = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map(bareJid));
const isAdmin = (group) =>
  group.participants.some(
    (p) => p.admin && [p.id, p.lid, p.phoneNumber].filter(Boolean).some((id) => me.has(bareJid(id))),
  );

console.log(`\nعدد المجموعات: ${groups.length}\n`);
groups.forEach((group, index) => {
  console.log(`${index + 1}) ${group.subject}`);
  console.log(`   ID: ${group.id}`);
  console.log(`   الأعضاء: ${group.participants.length} | البوت مشرف: ${isAdmin(group) ? 'نعم' : 'لا'}\n`);
});

console.log('انسخ معرّفات المجموعات المطلوبة فقط، مفصولة بفاصلة، وضعها في GROUP_IDS، مثال:');
console.log('GROUP_IDS=120363000000000001@g.us,120363000000000002@g.us\n');

await wa.stop();
process.exit(0);

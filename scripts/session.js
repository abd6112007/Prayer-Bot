// ============================================================
//  session.js — تشفير/فك تشفير جلسة واتساب لرفعها بأمان إلى GitHub
//
//  الاستخدام:
//    node scripts/session.js pack   [الملف]   ← يضغط مجلد data/ ويشفّره → session.enc
//    node scripts/session.js unpack [الملف]   ← يفك التشفير ويعيد مجلد data/
//
//  التشفير: AES-256-GCM، والمفتاح مشتق من SESSION_PASSPHRASE عبر scrypt.
//  الجلسة تعادل "تسجيل دخول كامل" لحسابك، فلا تُرفع أبداً بدون تشفير.
// ============================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../src/config.js';

const MAGIC = Buffer.from('WAS1'); // توقيع الملف + رقم الإصدار
const [command, fileArg] = process.argv.slice(2);
const file = fileArg ?? 'session.enc';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function getPassphrase() {
  const passphrase = config.sessionPassphrase;
  if (!passphrase) fail('المتغير SESSION_PASSPHRASE غير معيّن (ضعه في ملف .env أو في GitHub Secrets)');
  if (passphrase.length < 24) fail('SESSION_PASSPHRASE قصيرة — استخدم 32 حرفاً عشوائياً على الأقل');
  return passphrase;
}

const deriveKey = (passphrase, salt) => crypto.scryptSync(passphrase, salt, 32);

function encrypt(plain, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  // الصيغة: [توقيع 4][salt 16][iv 12][tag 16][البيانات المشفّرة]
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}

function decrypt(buffer, passphrase) {
  if (buffer.length < 48 || !buffer.subarray(0, 4).equals(MAGIC)) fail('ملف الجلسة غير صالح أو تالف');
  const salt = buffer.subarray(4, 20);
  const iv = buffer.subarray(20, 32);
  const tag = buffer.subarray(32, 48);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buffer.subarray(48)), decipher.final()]);
  } catch {
    fail('فشل فك التشفير: كلمة السر (SESSION_PASSPHRASE) خاطئة أو الملف تالف');
  }
}

/** يقرأ كل ملفات المجلد (كلها JSON نصي) إلى كائن {مسار نسبي: محتوى} */
function collectFiles(dir, base = dir) {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(result, collectFiles(full, base));
    else result[path.relative(base, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
  }
  return result;
}

function pack() {
  const passphrase = getPassphrase();
  const dataDir = config.dataDir;
  if (!fs.existsSync(path.join(dataDir, 'auth', 'creds.json'))) {
    fail(`لا توجد جلسة داخل ${dataDir}/auth — شغّل الأمر npm run login أولاً`);
  }
  const files = collectFiles(dataDir);
  const bundle = zlib.gzipSync(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }));
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, encrypt(bundle, passphrase));
  console.log(`✅ تم تشفير ${Object.keys(files).length} ملف في: ${file} (${fs.statSync(file).size} بايت)`);
}

function unpack() {
  const passphrase = getPassphrase();
  if (!fs.existsSync(file)) fail(`الملف غير موجود: ${file}`);
  const { files } = JSON.parse(zlib.gunzipSync(decrypt(fs.readFileSync(file), passphrase)).toString('utf8'));

  // حماية: لا نحذف إلا مجلداً داخل المشروع
  const root = path.resolve(config.dataDir);
  if (!root.startsWith(process.cwd() + path.sep)) fail('DATA_DIR يجب أن يكون مجلداً فرعياً داخل المشروع');

  fs.rmSync(root, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) fail(`مسار مشبوه داخل الحزمة: ${relative}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  console.log(`✅ تم فك تشفير ${Object.keys(files).length} ملف إلى: ${config.dataDir}/`);
}

if (command === 'pack') pack();
else if (command === 'unpack') unpack();
else fail('الاستخدام: node scripts/session.js <pack|unpack> [الملف]');

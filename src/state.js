// ============================================================
//  state.js — يتذكر ما أُرسل فعلاً حتى لا يتكرر التنبيه
//  (مهم لأن البوت يعمل على نسخ متعاقبة في GitHub Actions)
//  يُحفظ الملف داخل حزمة الجلسة المشفّرة مع مفاتيح واتساب.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { config, paths } from './config.js';

/**
 * @param {{persist?: boolean}} options  persist=false → الذاكرة فقط (وضع التجربة)
 */
export function loadState({ persist = true } = {}) {
  let sent = {};
  if (persist) {
    try {
      sent = JSON.parse(fs.readFileSync(paths.stateFile, 'utf8')).sent ?? {};
    } catch {
      /* لا يوجد ملف بعد — نبدأ من الصفر */
    }
  }

  /** كتابة ذرّية: نكتب ملفاً مؤقتاً ثم نعيد تسميته */
  const save = () => {
    if (!persist) return;
    fs.mkdirSync(path.dirname(paths.stateFile), { recursive: true });
    const tmp = `${paths.stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ sent }, null, 2));
    fs.renameSync(tmp, paths.stateFile);
  };

  return {
    has: (key) => key in sent,
    /** status: 'sent' (أُرسل) أو 'skipped' (فات موعده فتخطّيناه) — في الحالتين لا نعالجه ثانية */
    mark(key, status = 'sent') {
      sent[key] = `${status} ${new Date().toISOString()}`;
      save();
    },
    /** يحذف سجلات الصلوات الأقدم من 3 أيام (مفاتيحها تبدأ بالتاريخ). سجلات الترحيب تبقى دائماً */
    prune() {
      const cutoff = DateTime.now().setZone(config.timezone).minus({ days: 3 }).toFormat('yyyy-LL-dd');
      for (const key of Object.keys(sent)) {
        if (/^\d{4}-\d{2}-\d{2}_/.test(key) && key.slice(0, 10) < cutoff) delete sent[key];
      }
    },
    save,
  };
}

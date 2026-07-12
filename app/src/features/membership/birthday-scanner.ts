/**
 * 生日扫描器 — 在 App 启动时跑一次,之后每天定时跑一次,
 * 找出当天过生日的客户,触发 patient.birthday 事件。
 *
 * 依赖:
 *  - patientRepository.findAll() — 取出所有客户
 *  - membershipBus.emit(...) — 投递到规则引擎
 *
 * 同一天内同一客户不会重复触发:规则引擎端的 cooldownDays 控制。
 * 建议生日规则的 cooldownDays 设为 365(每年一次)。
 */
import { patientRepository } from "../patients/patient.repository";
import { processEvent } from "./rule-engine";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 比较"月-日"是否相等,忽略年份 */
export function isBirthdayToday(birthDate: Date, now: Date = new Date()): boolean {
  return (
    birthDate.getMonth() === now.getMonth() &&
    birthDate.getDate() === now.getDate()
  );
}

/** 计算到下一个午夜 00:00:00 的毫秒数 */
function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** 扫描并投递生日事件,返回命中的客户数 */
export async function scanAndEmitBirthdays(now: Date = new Date()): Promise<number> {
  const patients = await patientRepository.findAll();
  const birthdayPatients = patients.filter((p) => isBirthdayToday(p.birthDate, now));
  for (const p of birthdayPatients) {
    processEvent({ type: "patient.birthday", patientId: p.id, createdAt: now }).catch(() => {});
  }
  return birthdayPatients.length;
}

let started = false;

/** 启动后台扫描:启动时立即跑一次,之后每天凌晨 00:00 跑一次 */
export function startBirthdayScanner(): () => void {
  if (started) return () => {};
  started = true;

  // 启动时立即跑(异步,不阻塞 UI)
  void scanAndEmitBirthdays().then((n) => {
    if (n > 0) {
      console.info(`[membership] 🎂 ${n} 位客户今日过生日,已派发积分`);
    }
  });

  // 设置"下一个午夜"定时器,只一个,避免泄露
  let midnightTimer: ReturnType<typeof setTimeout> | null = null;
  let dailyInterval: ReturnType<typeof setInterval> | null = null;

  const scheduleNext = () => {
    const ms = msUntilNextMidnight();
    midnightTimer = setTimeout(async () => {
      const n = await scanAndEmitBirthdays();
      if (n > 0) console.info(`[membership] 🎂 每日扫描:${n} 位客户过生日`);
      // 切换到 24h 间隔
      dailyInterval = setInterval(async () => {
        const cnt = await scanAndEmitBirthdays();
        if (cnt > 0) console.info(`[membership] 🎂 每日扫描:${cnt} 位客户过生日`);
      }, ONE_DAY_MS);
    }, ms);
  };
  scheduleNext();

  return () => {
    started = false;
    if (midnightTimer) clearTimeout(midnightTimer);
    if (dailyInterval) clearInterval(dailyInterval);
  };
}

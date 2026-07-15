#!/usr/bin/env node
/**
 * 把 app/supabase-bootstrap/ 打包成 supabase-bootstrap.zip,直接发给最终用户。
 * 用户解压缩后按 QUICKSTART.md 操作即可。
 *
 * 用法:node scripts/build-bootstrap-zip.mjs
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(REPO_ROOT, "app", "supabase-bootstrap");
const ZIP_OUT = path.join(REPO_ROOT, "supabase-bootstrap.zip");

if (!fs.existsSync(SOURCE)) {
  console.error(`✗ 找不到 ${SOURCE}`);
  process.exit(1);
}

const isWindows = process.platform === "win32";

async function zip() {
  if (isWindows) {
    // PowerShell Compress-Archive
    const ps = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${SOURCE}\\*' -DestinationPath '${ZIP_OUT}' -Force`,
      ],
      { stdio: "inherit" },
    );
    return new Promise((resolve, reject) => {
      ps.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`PowerShell exit ${code}`))));
    });
  } else {
    // Linux/macOS: zip command
    const proc = spawn("zip", ["-r", ZIP_OUT, "supabase-bootstrap/"], {
      cwd: path.join(REPO_ROOT, "app"),
      stdio: "inherit",
    });
    return new Promise((resolve, reject) => {
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`zip exit ${code}`))));
    });
  }
}

(async () => {
  console.log("▶ 打包 supabase-bootstrap/ → supabase-bootstrap.zip");
  await zip();
  const size = fs.statSync(ZIP_OUT).size;
  console.log(`✓ 完成:${ZIP_OUT}(${(size / 1024).toFixed(1)} KB)`);
  console.log("");
  console.log("用法:把这个 zip 直接发给最终用户,他们解压后按 QUICKSTART.md 操作。");
})();

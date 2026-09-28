import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if(existsSync('.env')) { console.log('.env 已存在，保留现有配置。'); }
else {
  writeFileSync('.env',`PORT=3000\nHOST=127.0.0.1\nSITE_URL=http://localhost:3000\nSITE_OWNER=OMEN\nADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\nDATA_DIR=./data\n`,{mode:0o600});
  console.log('已生成 .env。管理员密码保存在其中的 ADMIN_PASSWORD；请在本机打开查看。');
}

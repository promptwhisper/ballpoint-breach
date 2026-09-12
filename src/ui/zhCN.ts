/** Presentation-only Chinese copy; weapon IDs and simulation events stay stable. */
export const WEAPON_COPY: Record<string, { name: string; hint: string }> = {
  RIFLE: { name: '突击步枪', hint: '按住左键连射 · 右键瞄准' },
  SHOTGUN: { name: '霰弹枪', hint: '近身散射 · 射后自动上膛' },
  REVOLVER: { name: '左轮手枪', hint: '六发重击 · 单击射击' },
  SNIPER: { name: '狙击步枪', hint: '右键开镜 · 单击精准射击' },
  KATANA: { name: '长刀', hint: '左键挥斩 · 按住右键格挡并反弹子弹' },
};

export const CHINESE_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const waveLabel = (wave: number): string => `第${CHINESE_NUMERALS[wave] ?? wave}阵`;

export const MESSAGE_COPY: Record<string, string> = {
  'FIRST MARKS ON THE PAGE': '初入墨境 · 击退来敌',
  'THE INK FIGHTS BACK': '墨潮渐起 · 守住阵地',
  'NO CLEAN MARGINS': '四面来敌 · 留意高处',
  'CROSS OUT EVERYTHING': '战意正酣 · 突破重围',
  'THE DOODLER IS COMING': '墨魁将至 · 决战在即',
  'SECOND DRAFT': '再起新稿 · 墨势更急',
  'CROSSFIRE IN THE MARGINS': '页边交火 · 留意远处',
  'HEAVY INK': '浓墨压境 · 重敌来袭',
  'NO ROOM TO BREATHE': '步步紧逼 · 无暇喘息',
  'THE FINAL DOODLE': '终墨落笔 · 墨魁再临',
  'THE DOODLER': '墨魁',
  'PHASE TWO · THE LINES GET ANGRY': '墨魁狂怒 · 第二阶段',
  'WAVE CLEARED': '此阵已破',
  'CATCH YOUR BREATH · RESTOCKING INK': '稍事休整 · 恢复生命与弹药',
  'POINTER LOCK UNAVAILABLE · MOVE THE CURSOR TO LOOK · ESC PAUSES': '移动鼠标转动视角 · 按退出键暂停',
  'TAP RIGHT TO FIRE · DRAG TO LOOK · HOLD FOR AUTO FIRE': '轻触右侧射击 · 拖动转向 · 长按连续射击',
  'LOW POWER MODE': '已自动降低画质 · 操作保持流畅',
  'PERFECT RETURN!': '完美反弹',
  'BLOCK BROKEN': '格挡耗尽',
  'BLOCKED': '格挡成功',
  'THE DOODLER SKETCHED REINFORCEMENTS': '墨魁召来了援兵',
  'HEALTH + AMMO': '生命与弹药已补充',
  'HEALTH REFILLED': '生命已恢复',
  'AMMO REFILLED': '弹药已补充',
};

export function chineseMessage(message: string): string {
  const wave = /^WAVE (\d+)$/.exec(message);
  if (wave) return waveLabel(Number(wave[1]));
  const weapon = /^weapon (\d+) ready$/.exec(message);
  if (weapon) return `已切换至${Object.values(WEAPON_COPY)[Number(weapon[1]) - 1]?.name ?? '武器'}`;
  return MESSAGE_COPY[message] ?? message;
}

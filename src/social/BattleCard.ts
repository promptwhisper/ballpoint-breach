export interface BattleCardStats {
  score: number;
  wave: number;
  kills: number;
  headshots: number;
  reflectedKills: number;
  meleeKills: number;
  maxCombo: number;
  healthRemaining: number;
  victory: boolean;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;

export function battleCardTitle(stats: BattleCardStats): string {
  if (stats.victory) return '十阵尽破';
  if (stats.reflectedKills >= 2) return '借墨还锋';
  if (stats.meleeKills >= Math.max(3, Math.ceil(stats.kills * 0.5))) return '白刃入墨';
  if (stats.headshots >= Math.max(3, Math.ceil(stats.kills * 0.4))) return '一笔封喉';
  if (stats.healthRemaining <= 20 && stats.wave >= 3) return '绝处破阵';
  if (stats.maxCombo >= 6) return '笔走龙蛇';
  return '墨痕未尽';
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const sourceRatio = source.width / source.height;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = source.width;
  let sh = source.height;
  if (sourceRatio > targetRatio) {
    sw = source.height * targetRatio;
    sx = (source.width - sw) / 2;
  } else {
    sh = source.width / targetRatio;
    sy = (source.height - sh) / 2;
  }
  context.drawImage(source, sx, sy, sw, sh, x, y, width, height);
}

function drawPaper(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#efeee7';
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.save();
  context.globalAlpha = 0.055;
  for (let index = 0; index < 105; index += 1) {
    const y = (index * 83) % CARD_HEIGHT;
    const bend = ((index * 47) % 27) - 13;
    context.strokeStyle = index % 6 === 0 ? '#8a5c47' : '#2a2c2a';
    context.lineWidth = index % 7 === 0 ? 2 : 1;
    context.beginPath();
    context.moveTo(-30, y);
    context.bezierCurveTo(260, y + bend, 730, y - bend, CARD_WIDTH + 30, y + bend * 0.4);
    context.stroke();
  }
  context.restore();
}

function drawInkWash(context: CanvasRenderingContext2D): void {
  const wash = context.createRadialGradient(870, 130, 10, 870, 130, 330);
  wash.addColorStop(0, 'rgba(28,31,29,.22)');
  wash.addColorStop(0.46, 'rgba(28,31,29,.07)');
  wash.addColorStop(1, 'rgba(28,31,29,0)');
  context.fillStyle = wash;
  context.fillRect(500, 0, 580, 500);
  context.save();
  context.globalAlpha = 0.11;
  context.fillStyle = '#202321';
  for (let index = 0; index < 9; index += 1) {
    context.beginPath();
    context.ellipse(930 - index * 24, 122 + index * 18, 82 - index * 5, 17 + index, -0.42, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawStat(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
): void {
  context.fillStyle = '#777872';
  context.font = '30px "BB WenKai UI", "Kaiti SC", serif';
  context.fillText(label, x, y);
  context.fillStyle = '#242725';
  context.font = '600 57px "BB Ink Number", "BB WenKai UI", serif';
  context.fillText(value, x, y + 62);
}

export function composeBattleCard(source: HTMLCanvasElement, stats: BattleCardStats): HTMLCanvasElement {
  const card = document.createElement('canvas');
  card.width = CARD_WIDTH;
  card.height = CARD_HEIGHT;
  const context = card.getContext('2d');
  if (!context) throw new Error('无法创建战帖画布');

  drawPaper(context);
  drawInkWash(context);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#6c716d';
  context.font = '28px "BB WenKai UI", "Kaiti SC", serif';
  context.fillText('破阵 · 水墨枪战', 72, 90);

  context.fillStyle = '#202321';
  context.font = '118px "BB Ink Display", "Kaiti SC", serif';
  context.fillText(battleCardTitle(stats), 66, 230);

  context.save();
  context.beginPath();
  context.rect(68, 300, 944, 612);
  context.clip();
  drawCover(context, source, 68, 300, 944, 612);
  const vignette = context.createLinearGradient(68, 300, 68, 912);
  vignette.addColorStop(0, 'rgba(15,18,16,.02)');
  vignette.addColorStop(1, 'rgba(15,18,16,.27)');
  context.fillStyle = vignette;
  context.fillRect(68, 300, 944, 612);
  context.restore();
  context.strokeStyle = 'rgba(32,35,33,.7)';
  context.lineWidth = 3;
  context.strokeRect(68, 300, 944, 612);

  context.save();
  context.translate(915, 835);
  context.rotate(-0.07);
  context.fillStyle = '#9b3b31';
  context.fillRect(-59, -59, 118, 118);
  context.strokeStyle = '#efeee7';
  context.lineWidth = 4;
  context.strokeRect(-49, -49, 98, 98);
  context.fillStyle = '#efeee7';
  context.font = '43px "BB Ink Display", "Kaiti SC", serif';
  context.textAlign = 'center';
  context.fillText('战', 0, -5);
  context.fillText('帖', 0, 40);
  context.restore();

  drawStat(context, '战绩', String(stats.score), 76, 1008);
  drawStat(context, '阵数', `第 ${Math.max(1, stats.wave)} 阵`, 392, 1008);
  drawStat(context, '击退', `${stats.kills} 人`, 716, 1008);
  drawStat(context, '爆头', `${stats.headshots} 次`, 76, 1158);
  drawStat(context, '最高连击', `${stats.maxCombo} 连`, 392, 1158);
  drawStat(context, '余血', `${Math.max(0, Math.ceil(stats.healthRemaining))}`, 716, 1158);

  context.strokeStyle = 'rgba(32,35,33,.25)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(70, 1302);
  context.lineTo(1010, 1302);
  context.stroke();
  context.fillStyle = '#292c2a';
  context.font = '39px "BB Ink Display", "Kaiti SC", serif';
  context.fillText('点开即玩 · 你能破到第几阵？', 72, 1370);
  return card;
}

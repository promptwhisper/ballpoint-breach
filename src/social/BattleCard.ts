export interface BattleCardStats {
  score: number;
  progress: string;
  levelName: string;
  kills: number;
  headshots: number;
  maxCombo: number;
  healthRemaining: number;
  victory: boolean;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;

export function battleCardTitle(stats: BattleCardStats): string {
  if (stats.victory) return stats.levelName === '经典生存' ? '十波守住' : '全关突破';
  if (stats.headshots >= Math.max(3, Math.ceil(stats.kills * 0.4))) return '一枪定稿';
  if (stats.healthRemaining <= 20 && stats.kills >= 3) return '纸边求生';
  if (stats.maxCombo >= 6) return '连笔成锋';
  return '弹痕未干';
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const sourceRatio = source.width / Math.max(1, source.height);
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

function drawNotebookPaper(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#f6f0dc';
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.save();
  context.strokeStyle = 'rgba(74, 118, 175, .16)';
  context.lineWidth = 2;
  for (let y = 78; y < CARD_HEIGHT; y += 58) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(CARD_WIDTH, y);
    context.stroke();
  }
  context.strokeStyle = 'rgba(208, 63, 82, .26)';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(56, 0);
  context.lineTo(56, CARD_HEIGHT);
  context.stroke();
  context.restore();
}

function drawStat(context: CanvasRenderingContext2D, label: string, value: string, x: number, y: number): void {
  context.fillStyle = '#73799b';
  context.font = '30px "Ballpoint Hand", "Kaiti SC", cursive';
  context.fillText(label, x, y);
  context.fillStyle = '#27348f';
  context.font = '58px "Ballpoint Marker", "Kaiti SC", cursive';
  context.fillText(value, x, y + 62);
}

export function composeBattleCard(source: HTMLCanvasElement, stats: BattleCardStats): HTMLCanvasElement {
  const card = document.createElement('canvas');
  card.width = CARD_WIDTH;
  card.height = CARD_HEIGHT;
  const context = card.getContext('2d');
  if (!context) throw new Error('无法创建战报画布');

  drawNotebookPaper(context);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#d43f52';
  context.font = '31px "Ballpoint Hand", "Kaiti SC", cursive';
  context.fillText(`纸上战场 · ${stats.levelName}`, 74, 92);
  context.fillStyle = '#27348f';
  context.font = '120px "Ballpoint Marker", "Kaiti SC", cursive';
  context.fillText(battleCardTitle(stats), 68, 232);

  context.save();
  context.translate(540, 606);
  context.rotate(-0.006);
  context.beginPath();
  context.rect(-472, -306, 944, 612);
  context.clip();
  drawCover(context, source, -472, -306, 944, 612);
  const shade = context.createLinearGradient(0, -306, 0, 306);
  shade.addColorStop(0, 'rgba(20, 30, 90, 0)');
  shade.addColorStop(1, 'rgba(20, 30, 90, .22)');
  context.fillStyle = shade;
  context.fillRect(-472, -306, 944, 612);
  context.restore();
  context.strokeStyle = '#27348f';
  context.lineWidth = 4;
  context.strokeRect(68, 300, 944, 612);
  context.fillStyle = '#d43f52';
  context.fillRect(835, 820, 130, 70);
  context.fillStyle = '#f6f0dc';
  context.textAlign = 'center';
  context.font = '39px "Ballpoint Marker", "Kaiti SC", cursive';
  context.fillText('战报', 900, 868);
  context.textAlign = 'left';

  drawStat(context, '战绩', String(stats.score), 76, 1008);
  drawStat(context, '进度', stats.progress, 392, 1008);
  drawStat(context, '击退', `${stats.kills} 人`, 716, 1008);
  drawStat(context, '爆头', `${stats.headshots} 次`, 76, 1158);
  drawStat(context, '最高连击', `${stats.maxCombo} 连`, 392, 1158);
  drawStat(context, '余血', `${Math.max(0, Math.ceil(stats.healthRemaining))}`, 716, 1158);

  context.strokeStyle = 'rgba(39, 52, 143, .32)';
  context.lineWidth = 2;
  context.setLineDash([12, 9]);
  context.beginPath();
  context.moveTo(72, 1302);
  context.lineTo(1008, 1302);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#27348f';
  context.font = '41px "Ballpoint Marker", "Kaiti SC", cursive';
  context.fillText('点开即玩 · 你能打到哪一关？', 72, 1372);
  return card;
}

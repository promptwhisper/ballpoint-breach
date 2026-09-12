interface MiniToolApi {
  writeTempFile?: (options: { data: string }) => Promise<{ filePath: string }>;
  saveImageToPhotosAlbum: (options: { filePath: string }) => Promise<unknown>;
}

interface XhsWindow extends Window {
  xhs?: { miniTool?: MiniToolApi };
}

export type SaveBattleCardResult = 'album';

export async function saveBattleCard(dataUrl: string, browserWindow: XhsWindow = window): Promise<SaveBattleCardResult> {
  const miniTool = browserWindow.xhs?.miniTool;
  if (!miniTool?.saveImageToPhotosAlbum) throw new Error('当前客户端暂不支持保存相册');
  const filePath = miniTool.writeTempFile
    ? (await miniTool.writeTempFile({ data: dataUrl })).filePath
    : dataUrl;
  await miniTool.saveImageToPhotosAlbum({ filePath });
  return 'album';
}

export function saveBattleCardError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/deny|denied|auth|permission|权限/i.test(message)) {
    return '未获得相册权限，请在系统设置中允许后重试。';
  }
  if (/暂不支持/.test(message)) return '当前客户端暂不支持保存相册。';
  return '保存失败，请稍后重试。';
}

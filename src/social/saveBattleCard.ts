interface MiniToolApi {
  writeTempFile?: (options: { data: string }) => Promise<{ filePath: string }>;
  saveImageToPhotosAlbum: (options: { filePath: string }) => Promise<unknown>;
}

interface XhsWindow extends Window {
  xhs?: { miniTool?: MiniToolApi };
}

export type SaveBattleCardResult = 'album' | 'download';

export async function saveBattleCard(dataUrl: string, browserWindow: XhsWindow = window): Promise<SaveBattleCardResult> {
  const miniTool = browserWindow.xhs?.miniTool;
  if (miniTool?.saveImageToPhotosAlbum) {
    const filePath = miniTool.writeTempFile
      ? (await miniTool.writeTempFile({ data: dataUrl })).filePath
      : dataUrl;
    await miniTool.saveImageToPhotosAlbum({ filePath });
    return 'album';
  }

  const link = browserWindow.document.createElement('a');
  link.href = dataUrl;
  link.download = `破阵-战帖-${Date.now()}.png`;
  link.hidden = true;
  browserWindow.document.body.append(link);
  link.click();
  link.remove();
  return 'download';
}

export function saveBattleCardError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /deny|denied|auth|permission|权限/i.test(message)
    ? '未获得相册权限，请在系统设置中允许后重试。'
    : '保存失败，请稍后重试。';
}

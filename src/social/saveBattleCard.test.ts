import assert from 'node:assert/strict';
import test from 'node:test';
import { saveBattleCard, saveBattleCardError } from './saveBattleCard';

type SaveWindow = NonNullable<Parameters<typeof saveBattleCard>[1]>;

test('mini-tool writes the battle card before saving it to the album', async () => {
  const calls: Array<[string, unknown]> = [];
  const fakeWindow = { xhs: { miniTool: {
    writeTempFile: async (options: { data: string }) => { calls.push(['write', options]); return { filePath: 'xhs://temp/card.png' }; },
    saveImageToPhotosAlbum: async (options: { filePath: string }) => { calls.push(['save', options]); },
  } } } as unknown as SaveWindow;
  assert.equal(await saveBattleCard('data:image/png;base64,AAAA', fakeWindow), 'album');
  assert.deepEqual(calls, [
    ['write', { data: 'data:image/png;base64,AAAA' }],
    ['save', { filePath: 'xhs://temp/card.png' }],
  ]);
});

test('web preview downloads the battle card', async () => {
  let clicked = false;
  const link = { href: '', download: '', hidden: false, click: () => { clicked = true; }, remove: () => undefined };
  const fakeWindow = { document: { createElement: () => link, body: { append: () => undefined } } } as unknown as SaveWindow;
  assert.equal(await saveBattleCard('data:image/png;base64,BBBB', fakeWindow), 'download');
  assert.equal(clicked, true);
  assert.match(link.download, /^纸上战场-战报-\d+\.png$/);
});

test('save errors use useful Chinese messages', () => {
  assert.match(saveBattleCardError(new Error('permission denied')), /相册权限/);
  assert.match(saveBattleCardError(new Error('unknown')), /保存失败/);
});

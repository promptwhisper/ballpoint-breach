import assert from 'node:assert/strict';
import test from 'node:test';
import { saveBattleCard, saveBattleCardError } from './saveBattleCard';

type SaveWindow = NonNullable<Parameters<typeof saveBattleCard>[1]>;

test('mini-tool writes the data URL to a temporary file before saving it', async () => {
  const calls: Array<[string, unknown]> = [];
  const fakeWindow = {
    xhs: {
      miniTool: {
        writeTempFile: async (options: { data: string }) => {
          calls.push(['write', options]);
          return { filePath: 'xhs://temp/battle-card.png' };
        },
        saveImageToPhotosAlbum: async (options: { filePath: string }) => {
          calls.push(['save', options]);
        },
      },
    },
  } as unknown as SaveWindow;

  assert.equal(await saveBattleCard('data:image/png;base64,AAAA', fakeWindow), 'album');
  assert.deepEqual(calls, [
    ['write', { data: 'data:image/png;base64,AAAA' }],
    ['save', { filePath: 'xhs://temp/battle-card.png' }],
  ]);
});

test('web preview downloads the card without invoking a social publishing API', async () => {
  let clicked = 0;
  let appended = 0;
  const link = {
    href: '', download: '', hidden: false,
    click: () => { clicked += 1; },
    remove: () => undefined,
  };
  const fakeWindow = {
    document: {
      createElement: () => link,
      body: { append: () => { appended += 1; } },
    },
  } as unknown as SaveWindow;

  assert.equal(await saveBattleCard('data:image/png;base64,BBBB', fakeWindow), 'download');
  assert.equal(clicked, 1);
  assert.equal(appended, 1);
  assert.equal(link.href, 'data:image/png;base64,BBBB');
  assert.match(link.download, /^破阵-战帖-\d+\.png$/);
});

test('permission errors receive a useful Chinese message', () => {
  assert.match(saveBattleCardError(new Error('permission denied')), /相册权限/);
  assert.match(saveBattleCardError(new Error('unknown failure')), /保存失败/);
});

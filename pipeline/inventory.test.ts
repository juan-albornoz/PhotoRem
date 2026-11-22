import { describe, expect, it } from 'vitest';

import { groupCanonFiles, groupIphoneFiles, parseIphoneName } from './inventory.ts';

describe('parseIphoneName', () => {
  it('reconoce originales, editadas y extensiones', () => {
    expect(parseIphoneName('IMG_4319.DNG')).toEqual({ number: '4319', edited: false, ext: 'DNG' });
    expect(parseIphoneName('IMG_E4319.jpg')).toEqual({ number: '4319', edited: true, ext: 'JPG' });
  });

  it('no reconoce archivos recibidos ni datos de Apple', () => {
    expect(parseIphoneName('ATFO5708.MP4')).toBeNull();
    expect(parseIphoneName('IMG_A4281.DAT')).toBeNull();
  });
});

describe('groupIphoneFiles', () => {
  it('prefiere tu versión editada, después JPG, HEIC y DNG', () => {
    const { photos } = groupIphoneFiles([
      'IMG_4319.DNG',
      'IMG_E4319.JPG',
      'IMG_4319.AAE',
      'IMG_4320.DNG',
      'IMG_4321.HEIC',
      'IMG_4321.JPG',
    ]);
    expect(photos).toEqual([
      { number: '4319', master: 'IMG_E4319.JPG', related: ['IMG_4319.DNG'], edited: true },
      { number: '4320', master: 'IMG_4320.DNG', related: [], edited: false },
      { number: '4321', master: 'IMG_4321.JPG', related: ['IMG_4321.HEIC'], edited: false },
    ]);
  });

  it('separa vídeos y descarta capturas, recibidos y archivos de edición', () => {
    const result = groupIphoneFiles([
      'IMG_5000.MOV',
      'IMG_E6219.MOV',
      'IMG_4557.PNG',
      'IMG_4987.AAE',
      'IMG_A4281.DAT',
      'RFNY0346.JPG',
    ]);
    expect(result.photos).toEqual([]);
    expect(result.videos).toEqual(['IMG_5000.MOV', 'IMG_E6219.MOV']);
    expect(result.ignored).toEqual([
      'IMG_4557.PNG',
      'IMG_4987.AAE',
      'IMG_A4281.DAT',
      'RFNY0346.JPG',
    ]);
  });

  it('una foto en vivo (HEIC + MOV) da una foto y un vídeo', () => {
    const result = groupIphoneFiles(['IMG_4639.HEIC', 'IMG_4639.MOV']);
    expect(result.photos.map((p) => p.master)).toEqual(['IMG_4639.HEIC']);
    expect(result.videos).toEqual(['IMG_4639.MOV']);
  });
});

describe('groupCanonFiles', () => {
  it('usa el JPG como principal y guarda el CR2 como relacionado', () => {
    const { photos, ignored } = groupCanonFiles([
      '_MG_9800.CR2',
      '_MG_9800.JPG',
      '_MG_9801.JPG',
      'Thumbs.db',
      '_MG_9999.CR2',
    ]);
    expect(photos).toEqual([
      { base: '_MG_9800', master: '_MG_9800.JPG', related: ['_MG_9800.CR2'] },
      { base: '_MG_9801', master: '_MG_9801.JPG', related: [] },
    ]);
    // Un CR2 sin su JPG no se pierde en silencio: queda en ignorados para revisarlo.
    expect(ignored).toEqual(['Thumbs.db', '_MG_9999.CR2']);
  });
});

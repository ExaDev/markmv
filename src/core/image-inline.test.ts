import { describe, it, expect } from 'vitest';
import {
  findInlineImages,
  findLocalImages,
  imageExtensionForMimeType,
  imageMimeTypeForExtension,
  parseImageDataUri,
  renderImageMarkdown,
  replaceSpans,
} from './image-inline.js';

describe('findLocalImages', () => {
  it('finds a local image link with alt text and source span', () => {
    const content = '# Doc\n\nHere is a diagram:\n\n![Diagram](diagram.png)\n';

    const images = findLocalImages(content);

    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toBe('Diagram');
    expect(images[0]?.href).toBe('diagram.png');
    expect(content.slice(images[0]?.start ?? -1, images[0]?.end ?? -1)).toBe(
      '![Diagram](diagram.png)'
    );
  });

  it('ignores remote, inline data, anchor and empty hrefs', () => {
    const content = [
      '# Doc',
      '',
      '![Remote](https://example.com/pic.png)',
      '',
      '![Inline](data:image/png;base64,iVBORw0KGgo=)',
      '',
      '![Anchor](#section)',
      '',
      '![Empty]()',
      '',
      '![Local](./img/photo.jpg)',
      '',
      '[A plain link, not an image](diagram.png)',
      '',
    ].join('\n');

    const images = findLocalImages(content);

    expect(images).toHaveLength(1);
    expect(images[0]?.href).toBe('./img/photo.jpg');
  });

  it('treats a windows drive-letter path as local, unlike a URI scheme', () => {
    const images = findLocalImages('![Pic](C:/pics/photo.png)');

    expect(images).toHaveLength(1);
    expect(images[0]?.href).toBe('C:/pics/photo.png');
  });

  it('captures the link title without its quotes', () => {
    const images = findLocalImages('![Alt](pic.png "The title")');

    expect(images).toHaveLength(1);
    expect(images[0]?.title).toBe('The title');
    expect(images[0]?.href).toBe('pic.png');
  });

  it('does not report image syntax inside fenced code blocks', () => {
    const content = '# Doc\n\n```\n![Not real](diagram.png)\n```\n\n![Real](photo.png)\n';

    const images = findLocalImages(content);

    expect(images).toHaveLength(1);
    expect(images[0]?.href).toBe('photo.png');
  });
});

describe('findInlineImages', () => {
  it('finds only image links whose href is a data URI', () => {
    const content = [
      '# Doc',
      '',
      '![Inline](data:image/png;base64,iVBORw0KGgo=)',
      '',
      '![Local](diagram.png)',
      '',
      '![Remote](https://example.com/pic.png)',
      '',
      '[Plain data link](data:text/plain;base64,aGVsbG8=)',
      '',
    ].join('\n');

    const images = findInlineImages(content);

    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toBe('Inline');
    expect(images[0]?.href).toBe('data:image/png;base64,iVBORw0KGgo=');
    const span = content.slice(images[0]?.start ?? -1, images[0]?.end ?? -1);
    expect(span).toBe('![Inline](data:image/png;base64,iVBORw0KGgo=)');
  });
});

describe('parseImageDataUri', () => {
  it('parses a base64 image data URI into mime type and payload', () => {
    const parsed = parseImageDataUri('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg');

    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.data).toBe('iVBORw0KGgoAAAANSUhEUg');
  });

  it('rejects a non-image data URI with a clear error', () => {
    expect(() => parseImageDataUri('data:text/html;base64,PGh0bWw=')).toThrow(
      /not an image data URI/i
    );
  });

  it('rejects data URIs that are not base64 encoded', () => {
    expect(() => parseImageDataUri('data:image/png,%89PNG%0D%0A')).toThrow(/only base64/i);
  });

  it('rejects a malformed data URI without a payload separator', () => {
    expect(() => parseImageDataUri('data:image/png')).toThrow(/malformed/i);
  });
});

describe('image mime type and extension mapping', () => {
  it('maps image file extensions to mime types', () => {
    expect(imageMimeTypeForExtension('.png')).toBe('image/png');
    expect(imageMimeTypeForExtension('jpg')).toBe('image/jpeg');
    expect(imageMimeTypeForExtension('jpeg')).toBe('image/jpeg');
    expect(imageMimeTypeForExtension('gif')).toBe('image/gif');
    expect(imageMimeTypeForExtension('webp')).toBe('image/webp');
    expect(imageMimeTypeForExtension('svg')).toBe('image/svg+xml');
    expect(imageMimeTypeForExtension('bmp')).toBe('image/bmp');
    expect(imageMimeTypeForExtension('ico')).toBe('image/x-icon');
    expect(imageMimeTypeForExtension('avif')).toBe('image/avif');
    expect(imageMimeTypeForExtension('tiff')).toBe('image/tiff');
  });

  it('throws for an unsupported extension, naming the supported ones', () => {
    expect(() => imageMimeTypeForExtension('pic')).toThrow(/unsupported image extension/i);
  });

  it('maps image mime types back to file extensions', () => {
    expect(imageExtensionForMimeType('image/png')).toBe('png');
    expect(imageExtensionForMimeType('image/jpeg')).toBe('jpg');
    expect(imageExtensionForMimeType('image/svg+xml')).toBe('svg');
    expect(imageExtensionForMimeType('image/x-icon')).toBe('ico');
    expect(imageExtensionForMimeType('image/webp')).toBe('webp');
  });

  it('throws for an unsupported mime type', () => {
    expect(() => imageExtensionForMimeType('image/heic')).toThrow(/unsupported image mime type/i);
  });
});

describe('renderImageMarkdown', () => {
  it('renders alt text, href and optional title', () => {
    expect(renderImageMarkdown('Diagram', 'diagram.png')).toBe('![Diagram](diagram.png)');
    expect(renderImageMarkdown('Diagram', 'diagram.png', 'A diagram')).toBe(
      '![Diagram](diagram.png "A diagram")'
    );
    expect(renderImageMarkdown(undefined, 'diagram.png')).toBe('![](diagram.png)');
  });

  it('escapes brackets in alt text and angle-wraps hrefs that contain spaces', () => {
    expect(renderImageMarkdown('a [bracket]', 'diagram.png')).toBe(
      '![a \\[bracket\\]](diagram.png)'
    );
    expect(renderImageMarkdown('Pic', 'my diagram.png')).toBe('![Pic](<my diagram.png>)');
  });

  it('leaves data URI hrefs unwrapped', () => {
    expect(renderImageMarkdown('Pic', 'data:image/png;base64,iVBORw0KGgo=')).toBe(
      '![Pic](data:image/png;base64,iVBORw0KGgo=)'
    );
  });
});

describe('replaceSpans', () => {
  it('replaces one span and several spans in a single pass', () => {
    const content = 'alpha ![one](a.png) beta ![two](b.png) gamma';

    const first = findLocalImages(content);
    const single = replaceSpans(content, [
      { start: first[0]?.start ?? -1, end: first[0]?.end ?? -1, replacement: 'ONE' },
    ]);
    expect(single).toBe('alpha ONE beta ![two](b.png) gamma');

    const both = replaceSpans(content, [
      { start: first[0]?.start ?? -1, end: first[0]?.end ?? -1, replacement: 'ONE' },
      { start: first[1]?.start ?? -1, end: first[1]?.end ?? -1, replacement: 'TWO' },
    ]);
    expect(both).toBe('alpha ONE beta TWO gamma');
  });

  it('throws on overlapping spans', () => {
    expect(() =>
      replaceSpans('![a](a.png)', [
        { start: 0, end: 11, replacement: 'x' },
        { start: 5, end: 8, replacement: 'y' },
      ])
    ).toThrow(/overlap/i);
  });

  it('throws on spans outside the content bounds', () => {
    expect(() => replaceSpans('short', [{ start: 3, end: 20, replacement: 'x' }])).toThrow(
      /bounds/i
    );
  });
});

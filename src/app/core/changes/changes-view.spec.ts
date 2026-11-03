import { changedText, crumbsOf, fileCount, linesText, shortDir, splitPath } from './changes-view';

describe('changes view helpers', () => {
  it('splits a path into the file name and its folder', () => {
    expect(splitPath('src/app/features/settings/settings.ts')).toEqual({ name: 'settings.ts', dir: 'src/app/features/settings/' });
    expect(splitPath('tokens.css')).toEqual({ name: 'tokens.css', dir: '' });
  });

  it('says how many files, in the singular too', () => {
    expect(fileCount(1)).toBe('1 file');
    expect(fileCount(6)).toBe('6 files');
    expect(changedText(1)).toBe('1 file changed');
    expect(changedText(6)).toBe('6 files changed');
  });

  it('gives the folders of a file below the project folder, else its absolute folders', () => {
    expect(crumbsOf('/home/me/proj/src/app/a.ts', '/home/me/proj')).toEqual(['src', 'app']);
    expect(crumbsOf('/home/me/proj/a.ts', '/home/me/proj/')).toEqual([]);
    expect(crumbsOf('/etc/nginx/a.conf', '/home/me/proj')).toEqual(['/', 'etc', 'nginx']);
  });

  it('counts lines without counting the empty one after the last newline', () => {
    expect(linesText(20, 'TypeScript')).toBe('20 lines · TypeScript');
    expect(linesText(1, 'Text')).toBe('1 line · Text');
  });

  it('keeps the first and the last folder of a long one', () => {
    expect(shortDir('src/app/features/settings/')).toBe('src/app/features/settings/');
    expect(shortDir('src/app/features/terminal-view/')).toBe('src/…/terminal-view/');
    expect(shortDir('a/b/')).toBe('a/b/');
    expect(shortDir('')).toBe('');
  });
});

import pkg from '../../../../package.json';
import { APP_VERSION } from './app-version';

describe('APP_VERSION', () => {
  it('is the frontend package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

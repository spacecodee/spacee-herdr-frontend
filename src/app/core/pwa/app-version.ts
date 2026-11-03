import { version } from '../../../../package.json';

/** The frontend's `package.json` version, bundled at build time (not read from the service worker). */
export const APP_VERSION: string = version;

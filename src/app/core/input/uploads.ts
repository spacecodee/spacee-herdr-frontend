import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '../session/session';

export type UploadFailure = 'too-big' | 'not-image' | 'session' | 'unreachable' | 'failed';

export class UploadError extends Error {
  constructor(readonly reason: UploadFailure) {
    super(reason);
  }
}

const GATEWAY_ERRORS = new Set([502, 503, 504]);

/** Sends an image to the bridge, which saves it on the host and answers with its absolute path. */
@Service()
export class Uploads {
  private readonly router = inject(Router);
  private readonly session = inject(Session);

  async upload(image: Blob): Promise<string> {
    let res: Response;
    try {
      res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': image.type },
        body: image,
        credentials: 'same-origin',
      });
    } catch {
      throw new UploadError('unreachable');
    }
    if (res.status === 401) {
      await this.session.check();
      await this.router.navigateByUrl('/login');
      throw new UploadError('session');
    }
    if (res.status === 413) throw new UploadError('too-big');
    if (res.status === 415) throw new UploadError('not-image');
    if (GATEWAY_ERRORS.has(res.status)) throw new UploadError('unreachable');
    if (res.status !== 201) throw new UploadError('failed');
    try {
      const body: unknown = await res.json();
      const path = (body as { path?: unknown })?.path;
      if (typeof path === 'string' && path !== '') return path;
    } catch {
      // fall through
    }
    throw new UploadError('failed');
  }
}

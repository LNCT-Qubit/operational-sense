import type { HttpResponse } from './types';

/** Pipes a Node ReadableStream to Express's response writable and destroys the stream if the client disconnects. */
export async function pipeStreamToResponse(res: HttpResponse, stream: NodeJS.ReadableStream): Promise<void> {
  const rawRes = res as unknown as NodeJS.WritableStream & { on(ev: string, fn: () => void): void };
  const destroyable = stream as unknown as { destroy?: () => void };
  rawRes.on('close', () => {
    if (typeof destroyable.destroy === 'function') {
      destroyable.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => {
    stream.on('error', (err) => reject(err));
    rawRes.on('finish', () => resolve());
    stream.pipe(rawRes);
  });
}

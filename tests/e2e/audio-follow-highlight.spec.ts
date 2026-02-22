import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const FIXTURE_URL = 'https://example.com/unity-audio-follow-highlight';

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Audio Follow Highlight Fixture</title>
    <style>
      body {
        margin: 40px auto;
        max-width: 760px;
        font-family: Georgia, serif;
        line-height: 1.35;
      }
      #article {
        border: 1px solid #ddd;
        border-radius: 12px;
        padding: 20px 24px;
        background: #fff;
      }
      .line {
        display: block;
        margin: 0 0 18px 0;
        white-space: nowrap;
      }
      .line--large {
        font-size: 48px;
        line-height: 1.12;
      }
    </style>
  </head>
  <body>
    <article id="article">
      <p id="line-1" class="line">
        First line keeps steady cadence with balanced words for deterministic mapping behavior.
      </p>
      <p id="line-2" class="line line--large">
        Second line is taller on purpose so area-based weighting can distort progress alignment.
      </p>
      <p id="line-3" class="line">
        Third line should become active near the end once boundaries approach final progress.
      </p>
    </article>
  </body>
</html>`;

async function sendTabMessage(popup: any, tabId: number, message: Record<string, unknown>): Promise<any> {
  return popup.evaluate(
    async ({ targetTabId, payload }: { targetTabId: number; payload: Record<string, unknown> }) => {
      const api = (globalThis as any).chrome;
      return await new Promise<any>((resolve, reject) => {
        api.tabs.sendMessage(targetTabId, payload, (response: any) => {
          const error = api.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response);
        });
      });
    },
    { targetTabId: tabId, payload: message },
  );
}

test('follow mode highlights the correct page line as speech progresses', async () => {
  test.setTimeout(180_000);

  const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
  await fs.access(extensionPath);

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-e2e-audio-follow-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: process.env.PW_HEADLESS !== '0',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  await context.route(FIXTURE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: FIXTURE_HTML,
    });
  });

  let popup = null as any;
  let articlePage = null as any;

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
    }
    const extensionId = new URL(serviceWorker.url()).host;

    articlePage = await context.newPage();
    await articlePage.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });

    await articlePage.evaluate(() => {
      const selection = window.getSelection();
      if (!selection) throw new Error('Selection API unavailable.');

      const startNode = document.querySelector('#line-1')?.firstChild;
      const endNode = document.querySelector('#line-3')?.firstChild;
      if (!(startNode instanceof Text) || !(endNode instanceof Text)) {
        throw new Error('Fixture text nodes unavailable.');
      }

      const range = document.createRange();
      range.setStart(startNode, 0);
      range.setEnd(endNode, endNode.textContent?.length ?? 0);
      selection.removeAllRanges();
      selection.addRange(range);
      const rect = range.getBoundingClientRect();
      document.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          clientX: Math.floor(rect.left + Math.max(6, Math.min(24, rect.width / 2))),
          clientY: Math.floor(rect.top + Math.max(6, Math.min(24, rect.height / 2))),
        }),
      );
      document.dispatchEvent(new Event('selectionchange'));
    });

    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    const tabId = await popup.evaluate(async (targetUrl: string) => {
      const tabs = await (globalThis as any).chrome.tabs.query({
        currentWindow: true,
        url: ['https://example.com/*', 'http://example.com/*'],
      });
      const target = tabs.find((tab: any) => String(tab.url ?? '').startsWith(targetUrl));
      return target?.id ?? null;
    }, FIXTURE_URL);
    expect(tabId).not.toBeNull();

    await sendTabMessage(popup, tabId as number, { type: 'AUDIO_SET_FOLLOW_MODE', enabled: true });
    const loadResponse = await sendTabMessage(popup, tabId as number, { type: 'AUDIO_DEBUG_LOAD_SELECTION' });
    expect(loadResponse?.ok).toBeTruthy();

    const earlyResponse = await sendTabMessage(popup, tabId as number, { type: 'AUDIO_DEBUG_SET_PROGRESS', progress: 0.18 });
    expect(earlyResponse?.ok).toBeTruthy();
    await articlePage.waitForTimeout(40);
    const earlyTop = await articlePage.evaluate(() => {
      const marker = document.querySelector<HTMLElement>('.unity-audio-page-follow-line[data-variant="current"]');
      return Number.parseFloat(marker?.style.top || 'NaN');
    });

    await articlePage.waitForTimeout(160);
    const lateResponse = await sendTabMessage(popup, tabId as number, { type: 'AUDIO_DEBUG_SET_PROGRESS', progress: 0.97 });
    expect(lateResponse?.ok).toBeTruthy();
    await articlePage.waitForTimeout(40);
    const followSnapshot = await articlePage.evaluate(() => {
      const marker = document.querySelector<HTMLElement>('.unity-audio-page-follow-line[data-variant="current"]');
      const line2 = document.querySelector<HTMLElement>('#line-2');
      const line3 = document.querySelector<HTMLElement>('#line-3');
      if (!marker || !line2 || !line3) {
        return null;
      }

      const markerTop = Number.parseFloat(marker.style.top || 'NaN');
      const line2Top = line2.getBoundingClientRect().top + window.scrollY;
      const line3Top = line3.getBoundingClientRect().top + window.scrollY;
      return {
        markerTop,
        line2Top,
        line3Top,
        markerVisible: marker.style.opacity !== '0',
      };
    });

    expect(followSnapshot).not.toBeNull();
    expect(followSnapshot?.markerVisible).toBeTruthy();
    expect(Number.isFinite(earlyTop)).toBeTruthy();
    expect(Number.isFinite(followSnapshot?.markerTop)).toBeTruthy();
    expect((followSnapshot?.markerTop ?? 0)).toBeGreaterThan((earlyTop as number) + 10);
    const distanceToLine2 = Math.abs((followSnapshot?.markerTop ?? 0) - (followSnapshot?.line2Top ?? 0));
    const distanceToLine3 = Math.abs((followSnapshot?.markerTop ?? 0) - (followSnapshot?.line3Top ?? 0));
    expect(distanceToLine3).toBeLessThan(distanceToLine2);
  } finally {
    await popup?.close().catch(() => {});
    await articlePage?.close().catch(() => {});
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});

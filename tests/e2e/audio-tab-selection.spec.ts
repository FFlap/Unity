import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TARGET_URL =
  'https://www.foxnews.com/media/trump-tears-jerk-bill-maher-truth-social-says-hosting-him-white-house-total-waste-time';

test('audio tab shows Ready and keeps selected text preview on foxnews', async () => {
  test.setTimeout(180_000);

  const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
  await fs.access(extensionPath);

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-e2e-audio-selection-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: process.env.PW_HEADLESS !== '0',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
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
    await articlePage.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await articlePage.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

    const selectedText = await articlePage.evaluate(() => {
      const selection = window.getSelection();
      if (!selection) {
        throw new Error('Selection API unavailable.');
      }

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node: Node) => {
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (text.length < 80) return NodeFilter.FILTER_REJECT;

            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.closest('script,style,noscript,svg,button,input,textarea')) return NodeFilter.FILTER_REJECT;

            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;

            const rect = parent.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return NodeFilter.FILTER_REJECT;

            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      let target: Text | null = null;
      while (walker.nextNode()) {
        target = walker.currentNode as Text;
        if ((target.textContent ?? '').replace(/\s+/g, ' ').trim().length >= 80) {
          break;
        }
      }
      if (!target || !target.textContent) {
        throw new Error('Could not find selectable article text.');
      }

      const normalized = target.textContent.replace(/\s+/g, ' ').trim();
      const startOffset = 0;
      const endOffset = Math.min(target.textContent.length, Math.max(40, Math.floor(target.textContent.length * 0.45)));

      const range = document.createRange();
      range.setStart(target, startOffset);
      range.setEnd(target, endOffset);
      selection.removeAllRanges();
      selection.addRange(range);
      const rect = range.getBoundingClientRect();
      document.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          clientX: Math.floor(rect.left + Math.max(4, Math.min(20, rect.width / 2))),
          clientY: Math.floor(rect.top + Math.max(4, Math.min(20, rect.height / 2))),
        }),
      );
      document.dispatchEvent(new Event('selectionchange'));
      target.parentElement?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });

      return normalized.slice(0, Math.min(70, normalized.length));
    });

    expect(selectedText.length).toBeGreaterThan(20);

    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
    await popup.getByRole('tab', { name: 'Audio' }).click();

    await expect(popup.locator('.status-badge')).toContainText('Ready', { timeout: 20_000 });
    await expect(popup.locator('.active-line-box')).toBeVisible({ timeout: 20_000 });
    await expect(popup.locator('.active-line-box')).toContainText(selectedText.slice(0, 24), { timeout: 20_000 });
    await expect(popup.locator('.idle-card')).toHaveCount(0);
  } finally {
    await popup?.close().catch(() => {});
    await articlePage?.close().catch(() => {});
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});

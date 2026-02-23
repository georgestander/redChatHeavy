const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

function normalize(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function getActiveComposer(page) {
  const loc = page.locator('[data-testid="multimodal-input"]');
  const count = await loc.count();
  let best = null;

  for (let i = 0; i < count; i += 1) {
    const candidate = loc.nth(i);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    const box = await candidate.boundingBox();
    if (!box) {
      continue;
    }

    if (!best || box.y > best.box.y || (box.y === best.box.y && box.x > best.box.x)) {
      best = { candidate, box };
    }
  }

  if (!best) {
    throw new Error('No visible chat composer was found.');
  }

  return best.candidate;
}

async function getBranchableSnapshot(page) {
  return await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('[data-branchable-text="true"]'));
    const latest = blocks.at(-1);
    return {
      count: blocks.length,
      latestText: latest?.textContent || '',
    };
  });
}

async function waitForAssistantIncrement(page, previous, timeout = 120000) {
  await page.waitForFunction(
    (snap) => {
      const blocks = Array.from(document.querySelectorAll('[data-branchable-text="true"]'));
      if (blocks.length === 0) {
        return false;
      }

      const latest = blocks.at(-1);
      const latestText = (latest?.textContent || '').trim();

      if (blocks.length > snap.count && latestText.length > 0) {
        return true;
      }

      if (blocks.length === snap.count && (latest?.textContent || '') !== snap.latestText && latestText.length > 0) {
        return true;
      }

      return false;
    },
    previous,
    { timeout }
  );
}

async function sendMessage(page, text) {
  const composer = await getActiveComposer(page);
  await composer.click();
  await composer.fill(text);

  const before = await getBranchableSnapshot(page);
  await composer.press('Enter');

  const errorBanner = page.getByText('Something went wrong');
  try {
    await Promise.race([
      waitForAssistantIncrement(page, before),
      errorBanner.waitFor({ state: 'visible', timeout: 120000 }),
    ]);
  } catch {
    throw new Error(`Timed out waiting for response after sending message: ${text}`);
  }

  if (await errorBanner.isVisible().catch(() => false)) {
    const retry = page.getByRole('button', { name: 'Try again' });
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      await waitForAssistantIncrement(page, before, 120000);
    } else {
      throw new Error('Model request failed and retry button was not available.');
    }
  }
}

async function getVisibleLabelCount(page, regex) {
  const loc = page.getByText(regex);
  const count = await loc.count();
  let visible = 0;

  for (let i = 0; i < count; i += 1) {
    if (await loc.nth(i).isVisible().catch(() => false)) {
      visible += 1;
    }
  }

  return visible;
}

async function selectLatestAssistantSnippet(page, fallbackLength = 80) {
  const result = await page.evaluate((len) => {
    const blocks = Array.from(document.querySelectorAll('[data-branchable-text="true"]'));
    const latest = blocks.at(-1);
    if (!latest) {
      return null;
    }

    const walker = document.createTreeWalker(latest, NodeFilter.SHOW_TEXT);
    let target = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (value.length > 0) {
        target = node;
        break;
      }
    }

    if (!target || !target.textContent) {
      return null;
    }

    const normalized = target.textContent.replace(/\s+/g, ' ').trim();
    const snippet = normalized.slice(0, Math.min(len, normalized.length));

    if (!snippet) {
      return null;
    }

    const range = document.createRange();
    range.setStart(target, 0);
    range.setEnd(target, Math.min(target.textContent.length, snippet.length));

    const selection = window.getSelection();
    if (!selection) {
      return null;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));

    const rect = range.getBoundingClientRect();
    return {
      snippet: snippet.trim(),
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      },
    };
  }, fallbackLength);

  if (!result) {
    throw new Error('Unable to select assistant snippet.');
  }

  const branchPopupButton = page.getByRole('button', { name: 'Branch', exact: true }).first();
  await branchPopupButton.waitFor({ state: 'visible', timeout: 10000 });

  const geometry = await page.evaluate(() => {
    const branchButton = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Branch'
    );
    const selection = window.getSelection();
    if (!branchButton || !selection || selection.rangeCount === 0) {
      return null;
    }

    const selRect = selection.getRangeAt(0).getBoundingClientRect();
    const btnRect = branchButton.getBoundingClientRect();

    return {
      selTop: selRect.top,
      selBottom: selRect.bottom,
      btnTop: btnRect.top,
      btnBottom: btnRect.bottom,
    };
  });

  if (!geometry) {
    throw new Error('Unable to read branch popup geometry.');
  }

  const isAbove = geometry.btnBottom <= geometry.selTop + 1;
  const isBelow = geometry.btnTop >= geometry.selBottom - 1;
  if (!isAbove && !isBelow) {
    throw new Error('Branch popup is not positioned above or below the highlighted text.');
  }

  return { snippet: normalize(result.snippet), branchPopupButton };
}

async function createBranchFromSelection(page) {
  const previousBranchId = await page.evaluate(() =>
    new URL(window.location.href).searchParams.get('branch')
  );

  const { snippet, branchPopupButton } = await selectLatestAssistantSnippet(page);
  await branchPopupButton.click();

  await page.waitForFunction(
    (prev) => {
      const params = new URL(window.location.href).searchParams;
      const nextBranch = params.get('branch');
      return Boolean(nextBranch) && nextBranch !== prev;
    },
    previousBranchId,
    { timeout: 60000 }
  );

  await page.waitForTimeout(2500);

  const welcome = page.getByRole('heading', { name: 'How can I help you today?' });
  if (await welcome.isVisible().catch(() => false)) {
    throw new Error('Active child branch still rendered welcome/new chat state.');
  }

  const labelVisibleCount = await getVisibleLabelCount(page, /from highlighted text/i);
  if (labelVisibleCount === 0) {
    throw new Error('Expected visible "From highlighted text" label in child branch composer.');
  }

  const parentContextVisible = await page.getByText('Parent Context').first().isVisible().catch(() => false);
  if (!parentContextVisible) {
    throw new Error('Expected compare parent context panel to be visible after branching.');
  }

  return { snippet, previousBranchId };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const newChatButton = page.getByRole('button', { name: /new chat/i });
    if (await newChatButton.isVisible().catch(() => false)) {
      await newChatButton.click();
    }

    await sendMessage(page, 'what are the fundamentals of front-end engineering');

    const first = await createBranchFromSelection(page);

    await sendMessage(page, 'expand that highlighted point with practical examples');

    const second = await createBranchFromSelection(page);

    await sendMessage(page, 'continue from this child branch context in one short paragraph');

    const url = page.url();
    console.log('SMOKE_OK');
    console.log(
      JSON.stringify(
        {
          url,
          firstSnippet: first.snippet,
          secondSnippet: second.snippet,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
})();

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Layout/loading tests don't need a GPU; retain the site's normal static fallback.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
});

for (const lang of ['en', 'ur']) test(`public ${lang} layout across Tailwind breakpoints`, async ({page}) => {
  await page.goto(`/${lang}`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  for (const width of [320, 375, 640, 768, 1024, 1280, 1536]) {
    await page.setViewportSize({width, height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `overflow at ${width}`).toBeLessThanOrEqual(width + 1);
    const sections = await page.locator('#treatments, #dentists, #how, #visit, #faq').evaluateAll(elements => elements.map(el => ({id:el.id, width:el.clientWidth, content:el.scrollWidth})));
    for (const section of sections) expect(section.content, `${section.id} clips content at ${width}`).toBeLessThanOrEqual(section.width + 1);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 251, 252)');
  }
});

test('sign-in shows a spinner during POST and recovers from a failed request', async ({page}) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/admin/auth/login', async route => {
    await pending;
    await route.fulfill({status:401, json:{error:'unauthorized'}});
  });
  await page.setViewportSize({width:320,height:850});
  await page.goto('/admin/login');
  await page.getByLabel('Email', {exact:true}).fill('test@example.invalid');
  await page.getByLabel('Password', {exact:true}).fill('synthetic-password');
  await page.getByRole('button', {name:'Sign in',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Signing in');
  await expect(page.getByRole('status').locator('svg')).toBeVisible();
  await expect(page.getByLabel('Email', {exact:true})).toBeDisabled();
  release();
  await expect(page.getByRole('alert').filter({hasText:'incorrect'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Sign in',exact:true})).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('appointment lookup and cancellation show labelled spinners without live writes', async ({page}) => {
  let release!: () => void;
  let pending = new Promise<void>(resolve => { release=resolve; });
  await page.route('**/api/chat', route => route.fulfill({json:{demo:true}}));
  await page.route('**/api/appointments', async route => {
    const cancel=route.request().postDataJSON().action === 'cancel';
    await pending;
    await route.fulfill({json:cancel ? {ok:true,cancelled:true,reference:'DEMO-LOADER',emailed:false} : {ok:true,appointments:[{reference:'DEMO-LOADER',service:'Consultation',dentist:'Test Doctor',date:'2026-10-30',time:'10:00',minutes:30,status:'confirmed'}]}});
  });
  await page.setViewportSize({width:320,height:850});
  await page.goto('/en');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-ready'));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dentalflow:open-chat', {detail:{}})));
  const chat=page.getByRole('dialog',{name:'Clinic assistant',exact:true});
  await chat.getByRole('button',{name:'View My Appointments',exact:true}).click();
  await chat.getByRole('textbox').fill('03000000099');
  await chat.getByRole('textbox').press('Enter');
  await expect(chat.getByRole('status').locator('svg')).toBeVisible();
  await expect(chat.getByRole('status')).toContainText('Loading appointments');
  release();
  await expect(chat.getByText('DEMO-LOADER',{exact:true})).toBeVisible();
  pending=new Promise<void>(resolve=>{release=resolve;});
  await chat.getByRole('button',{name:'Cancel',exact:true}).click();
  await chat.getByRole('button',{name:'Yes, cancel',exact:true}).click();
  await expect(chat.getByRole('status')).toContainText('Cancelling');
  await expect(chat.getByRole('status').locator('svg')).toBeVisible();
  release();
  await expect(chat.getByRole('status')).toHaveCount(0);
  await expect(chat.getByText('Cancelled',{exact:true})).toBeVisible();
});

test('chat replies and slot reads keep a visible spinner until each request finishes', async ({page}) => {
  let release!: () => void;
  let pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/chat', async route => {
    if(route.request().method()==='GET') return route.fulfill({json:{demo:true}});
    await pending;
    await route.fulfill({json:{ok:true,reply:'Synthetic reply. How can I help?',lang:'en',demo:true}});
  });
  await page.route('**/api/slots?*', async route => {
    await pending;
    await route.fulfill({status:503,json:{error:'unavailable'}});
  });
  await page.goto('/en');
  await page.waitForFunction(()=>document.documentElement.hasAttribute('data-ready'));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dentalflow:open-chat',{detail:{}})));
  const chat=page.getByRole('dialog',{name:'Clinic assistant',exact:true});
  await chat.getByRole('textbox').fill('Tell me about your clinic');
  await chat.getByRole('textbox').press('Enter');
  await expect(chat.getByRole('status').locator('svg')).toBeVisible();
  release();
  await expect(chat.getByText('Synthetic reply. How can I help?')).toBeVisible();
  await expect(chat.getByRole('status')).toHaveCount(0);
  pending=new Promise<void>(resolve=>{release=resolve;});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dentalflow:open-chat',{detail:{book:{}}})));
  const panel=page.getByRole('dialog',{name:'Book an appointment',exact:true});
  await panel.getByRole('button',{name:/root canal/i}).click();
  await expect(panel.getByRole('status').locator('svg')).toBeVisible();
  release();
  await expect(panel.getByRole('alert')).toContainText('could not check');
  await expect(panel.getByRole('status')).toHaveCount(0);
});

test('Arabic routes redirect and navigation offers only English and Urdu', async ({page}) => {
  await page.goto('/ar?source=language-test');
  await expect(page).toHaveURL(/\/en\?source=language-test$/);
  await expect(page.locator('a[href^="/ar"]')).toHaveCount(0);
  await expect(page.locator('link[hreflang="ar"]')).toHaveCount(0);
});

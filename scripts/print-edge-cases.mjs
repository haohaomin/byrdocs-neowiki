// Additional browser cases; serialized into Playwright CLI by check-print.mjs.
export async function checkPrintEdgeCases(page, baseURL) {
  const results = [];
  const check = (name, pass, actual) => results.push({name, pass: Boolean(pass), actual});
  const ready = async path => {
    await page.goto(baseURL + '/exam/' + path + '/');
    await page.waitForSelector('#examPrintDialog[data-ready="true"]', {state: 'attached'});
  };
  await ready('24-25-1-进阶综合英语（上）-期末');
  const english = await page.evaluate(async () => {
    const {buildPrintAnswersAppendix} = await import('/src/scripts/printAppendix.ts');
    return [...buildPrintAnswersAppendix(document.querySelector('.exam-page-main')).querySelectorAll('.print-answer-item')]
      .filter(el => ['D', 'G', 'J'].includes(el.querySelector('.print-answer-body').textContent.trim()))
      .map(el => el.querySelector('.print-answer-label').textContent);
  });
  check('Real English paper keeps question 46 under its section heading', english.some(label => label.includes('46.')), english);
  const labels = await page.evaluate(async () => {
    const {buildPrintAnswersAppendix} = await import('/src/scripts/printAppendix.ts');
    const blank = text => '<span class="exam-blank"><span class="exam-blank-answer">' + text + '</span></span>';
    const build = html => {
      const root = document.createElement('main');
      root.className = 'exam-page-main';
      root.innerHTML = html;
      return [...buildPrintAnswersAppendix(root).querySelectorAll('.print-answer-label')].map(el => el.textContent);
    };
    return {
      subparts: build('<h2>简答</h2><h3>4.</h3><ol><li>' + blank('a') + '</li><li>' + blank('b') + '</li></ol>'),
      hierarchy: build('<h2>Reading</h2><h3>Section A</h3><h4>Passage One</h4><ol start="26"><li>' + blank('a') + '</li></ol>'),
      reversed: build('<h2>题目</h2><ol reversed start="5"><li>' + blank('a') + '</li><li value="9">' + blank('b') + '</li><li>' + blank('c') + '</li></ol>'),
      nested: build('<h2>题目</h2><ol start="3"><li>题干<ol start="2"><li>' + blank('a') + '</li></ol></li></ol>'),
      mixed: build('<h2>题目</h2><h3>第一题</h3>' + blank('a') + '<fieldset class="exam-choices"><div class="exam-choices-item">第 2 题</div><span class="exam-choice-option" data-answer="true"></span></fieldset>'),
    };
  });
  check('Subquestion numbers are not replaced by h3', labels.subparts.join('|') === '4. · 1.|4. · 2.', labels.subparts);
  check('Nested headings retain passage and question number', labels.hierarchy[0] === 'Section A · Passage One · 26.', labels.hierarchy);
  check('Reversed lists and li value preserve displayed numbers and order', labels.reversed.join('|') === '5.|9.|8.', labels.reversed);
  check('Nested ordered lists retain the parent question', labels.nested[0] === '3. · 2.', labels.nested);
  check('Mixed explicit labels stay in source order', labels.mixed.join('|') === '第一题|2.', labels.mixed);

  await ready('24-25-1-数据结构-期末');
  await page.evaluate(() => {
    const figure = document.querySelector('.exam-figure');
    figure.querySelector('img').src = '/__print_missing_fixture__.svg';
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  });
  await page.waitForSelector('main .exam-figure[data-state="missing"]');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({media: 'print'});
  const missing = await page.evaluate(() => {
    const figure = document.querySelector('.exam-print-document .exam-figure[data-state="missing"]');
    const placeholder = figure?.querySelector('.exam-figure-missing');
    return {visible: !!placeholder && getComputedStyle(placeholder).display !== 'none', scheme: getComputedStyle(document.documentElement).colorScheme};
  });
  check('Unavailable figures retain a visible warning in print', missing.visible, missing);
  check('Print retains the live dark color scheme', missing.scheme === 'dark', missing.scheme);
  await page.locator('.exam-print-document .exam-figure[data-state="missing"]').first().screenshot({path: 'output/playwright/missing-figure.png'});
  // A copied image may fail only after preparation, or succeed after the live
  // page had marked it missing. Exercise both listeners on the print copy.
  await page.evaluate(() => {
    const figure = document.querySelector('.exam-print-document .exam-figure');
    delete figure.dataset.state;
    figure.querySelector('img').src = '/__print_late_missing_fixture__.svg';
  });
  await page.waitForSelector('.exam-print-document .exam-figure[data-state="missing"]');
  check('Image failure after cloning shows the placeholder', await page.locator('.exam-print-document .exam-figure[data-state="missing"] .exam-figure-missing').isVisible());
  await page.evaluate(() => {
    document.querySelector('.exam-print-document .exam-figure img').src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>';
  });
  await page.waitForFunction(() => !document.querySelector('.exam-print-document .exam-figure').hasAttribute('data-state'));
  check('Recovered copied image is visible', await page.locator('.exam-print-document .exam-figure img').first().isVisible());
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({media: 'screen'});
  check('Screen keeps its original dark color scheme', await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === 'dark'));

  // Cancel one preparation via the native lifecycle, then start another while
  // image decoding is still outstanding. Old async work must not print the new job.
  await ready('24-25-1-数据结构-期末');
  const race = await page.evaluate(async () => {
    const originalDecode = HTMLImageElement.prototype.decode;
    const batches = [[], []];
    let batch = 0, calls = 0;
    HTMLImageElement.prototype.decode = function () { return new Promise(resolve => batches[batch].push(resolve)); };
    window.print = () => { calls++; };
    const clickPrint = () => { document.querySelector('#examPrint').click(); document.querySelector('#examPrintDialogConfirm').click(); };
    const tick = () => new Promise(resolve => setTimeout(resolve, 50));
    try {
      clickPrint();
      window.dispatchEvent(new Event('afterprint'));
      batch = 1;
      clickPrint();
      batches[0].forEach(resolve => resolve());
      await tick();
      const staleCalls = calls;
      batches[1].forEach(resolve => resolve());
      await tick();
      return {staleCalls, calls, batches: batches.map(b => b.length)};
    } finally {
      HTMLImageElement.prototype.decode = originalDecode;
      batches.flat().forEach(resolve => resolve());
      window.dispatchEvent(new Event('afterprint'));
    }
  });
  check('Cancelled preparation cannot print a later job', race.staleCalls === 0 && race.calls === 1 && race.batches.every(n => n > 0), race);
  return {checks: results.length, failures: results.filter(result => !result.pass), results};
}

// Follow the real preparation screens; never bypass guest navigation ownership.
const steps = ['players', 'pitch', 'rules'];
async function goToSetup(page, target) {
  let state = await page.evaluate(() => sportheads.snapshot());
  if (state.role === 'guest' && state.connected && state.setupStep !== target) throw Error('The guest must follow the host');
  if (state.setupStep === 'home') { await page.locator('#play-local').click(); state = await page.evaluate(() => sportheads.snapshot()); }
  for (let count = 0; state.setupStep !== target && count < 4; count++) {
    const current = steps.indexOf(state.setupStep), wanted = steps.indexOf(target);
    if (current < 0 || wanted < 0) throw Error(`Cannot navigate ${state.setupStep} to ${target}`);
    await page.locator(current < wanted ? '#setup-next' : '#setup-back').click();
    state = await page.evaluate(() => sportheads.snapshot());
  }
  if (state.setupStep !== target) throw Error(`Did not reach ${target}`);
}
async function setTarget(page, target) {
  if (!Number.isInteger(target) || target < 1 || target > 9) throw Error('Goal target must be between 1 and 9');
  for (let count = 0; count < 10; count++) {
    const current = Number(await page.locator('#target-score').inputValue());
    if (current === target) return;
    await page.locator(current < target ? '#goal-plus' : '#goal-minus').click();
  }
  throw Error('Goal stepper did not reach ' + target);
}
module.exports = { goToSetup, setTarget };

async function setBalance(page, preset, amount = 30) {
  await page.locator(`[data-balance-preset="${preset}"]`).click();
  if (preset === 'blue' || preset === 'red') await page.locator(`[data-balance-amount="${amount}"]`).click();
}
async function setManualBuffs(page, buffs) {
  await setBalance(page, 'manual');
  for (const side of [0, 1]) {
    await page.locator(`[data-balance-side="${side}"]`).click();
    for (const stat of [0, 1, 2, 3, 4]) await page.locator(`[data-buff-stat="${stat}"]`).fill(String(buffs[side][stat]));
  }
}
module.exports.setBalance = setBalance;
module.exports.setManualBuffs = setManualBuffs;

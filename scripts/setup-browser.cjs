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
module.exports = { goToSetup };

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdaptiveQuality,
  renderPixelRatio,
  RENDER_PROFILES,
} from '../../web/src/three/render-quality.js';
function drive(quality, start, duration, interval, rendered = true) {
  for (let t = start; t < start + duration; t += interval) quality.sample(t, rendered);
  return start + duration;
}
test('sustained slow frames lower quality in stages and sustained recovery restores it', () => {
  const q = createAdaptiveQuality();
  let time = drive(q, 0, 5000, 40);
  assert.equal(q.profile.name, 'balanced');
  time = drive(q, time, 9000, 40);
  assert.equal(q.profile.name, 'light');
  assert.equal(q.profile.shadows, false);
  time = drive(q, time, 20000, 16);
  assert.notEqual(q.profile.name, 'light');
  drive(q, time, 25000, 16);
  assert.equal(q.profile.name, 'full');
});
test('idle, hidden, startup and long suspension gaps do not reduce quality', () => {
  const q = createAdaptiveQuality();
  drive(q, 0, 2000, 100);
  drive(q, 2000, 15000, 40, false);
  q.sample(50000, true);
  q.sample(60000, true);
  drive(q, 60016, 15000, 16);
  assert.equal(q.profile.name, 'full');
});
test('isolated stutters and alternating window speeds do not cause quality oscillation', () => {
  const q = createAdaptiveQuality();
  let time = drive(q, 0, 4000, 16);
  for (let i = 0; i < 6; i++) {
    time = drive(q, time, 1240, 40);
    time = drive(q, time, 2500, 16);
  }
  assert.equal(q.profile.name, 'full');
});
test('each profile enforces its GPU pixel budget without changing CSS viewport dimensions', () => {
  for (const profile of RENDER_PROFILES)
    for (const [width, height, dpr] of [
      [3840, 2160, 2],
      [1920, 1080, 1.5],
      [640, 480, 1],
    ]) {
      const ratio = renderPixelRatio(width, height, dpr, profile);
      assert.ok(width * height * ratio * ratio <= profile.pixels + 0.001);
      assert.ok(ratio <= dpr && ratio <= profile.ratio && ratio > 0);
    }
});

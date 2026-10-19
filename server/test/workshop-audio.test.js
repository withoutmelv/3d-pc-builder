import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkshopAudio } from '../../web/src/audio/workshop-audio.js';

test('audio starts lazily, mute discards pending cues, and dispose prevents new playback', () => {
  const previous = globalThis.window;
  const contexts = [];
  const param = {
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  class AudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.starts = [];
      contexts.push(this);
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    createGain() {
      return { gain: param, connect() {}, disconnect() {} };
    }
    createOscillator() {
      return {
        frequency: param,
        connect: (node) => node,
        start: (time) => this.starts.push(time),
        stop() {},
        disconnect() {},
      };
    }
  }
  globalThis.window = { AudioContext };
  try {
    const audio = createWorkshopAudio();
    assert.equal(contexts.length, 0);
    audio.play('install');
    assert.equal(contexts[0].starts.length, 2);
    audio.setMuted(true);
    assert.equal(contexts[0].state, 'closed');
    audio.play('latch');
    assert.equal(contexts.length, 1);
    audio.setMuted(false);
    audio.play('screw');
    assert.equal(contexts.length, 2);
    audio.dispose();
    audio.play('pick');
    assert.equal(contexts.length, 2);
    assert.equal(contexts[1].state, 'closed');
  } finally {
    globalThis.window = previous;
  }
});

test('unavailable audio cannot interrupt assembly', () => {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    const audio = createWorkshopAudio();
    assert.doesNotThrow(() => {
      audio.play('install');
      audio.setMuted(true);
      audio.dispose();
    });
  } finally {
    globalThis.window = previous;
  }
});

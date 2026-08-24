/**
 * Ambient room tone for the data hall, generated rather than downloaded.
 *
 * A data hall is not silent and it is not musical: it is a low mains hum
 * under a wide band of fan noise. That is two detuned low oscillators and a
 * lowpassed noise buffer, which the Web Audio API can synthesise in a few
 * lines and which costs nothing to ship.
 *
 * It is OFF by default and only ever starts from a real click. Browsers block
 * autoplaying audio anyway, but the reason not to do it is that sound
 * arriving unasked from a web page is hostile.
 */

import { logWarning } from "@/lib/error-log";

/** Quiet enough to sit under speech, loud enough to notice on headphones. */
const TARGET_GAIN = 0.045;
const FADE_IN_SECONDS = 1.6;
const FADE_OUT_SECONDS = 0.5;

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function isAmbientAudioSupported(): boolean {
  return getAudioContextConstructor() !== null;
}

class AmbientHum {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private running = false;

  get isRunning() {
    return this.running;
  }

  /** Must be called from a user gesture. Returns false if audio is unavailable. */
  async start(): Promise<boolean> {
    if (this.running) return true;
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return false;

    try {
      const context = this.context ?? new Ctor();
      this.context = context;
      if (context.state === "suspended") await context.resume();

      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.exponentialRampToValueAtTime(
        TARGET_GAIN,
        context.currentTime + FADE_IN_SECONDS,
      );
      master.connect(context.destination);
      this.master = master;

      // Mains hum: a fundamental and a slightly detuned fifth above it, both
      // well below anything a laptop speaker will reproduce cleanly, which is
      // roughly how a plant room sounds through a door.
      for (const [frequency, level] of [
        [52, 0.55],
        [78.5, 0.25],
      ] as const) {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        const gain = context.createGain();
        gain.gain.setValueAtTime(level, context.currentTime);
        oscillator.connect(gain).connect(master);
        oscillator.start();
        this.nodes.push(oscillator);
      }

      // Fan wash: two seconds of noise, lowpassed hard and looped. Generated
      // once at start rather than per frame.
      const seconds = 2;
      const buffer = context.createBuffer(
        1,
        Math.floor(context.sampleRate * seconds),
        context.sampleRate,
      );
      const channel = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < channel.length; i += 1) {
        // A one pole lowpass on white noise gives brown noise, which is much
        // closer to airflow than the hiss of raw white noise.
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        channel[i] = last * 3.2;
      }
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(420, context.currentTime);
      filter.Q.setValueAtTime(0.6, context.currentTime);
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.6, context.currentTime);
      noise.connect(filter).connect(noiseGain).connect(master);
      noise.start();
      this.nodes.push(noise);

      // A very slow swell so the bed does not sound like a held note.
      const lfo = context.createOscillator();
      lfo.frequency.setValueAtTime(0.06, context.currentTime);
      const lfoGain = context.createGain();
      lfoGain.gain.setValueAtTime(0.1, context.currentTime);
      lfo.connect(lfoGain).connect(noiseGain.gain);
      lfo.start();
      this.nodes.push(lfo);

      this.running = true;
      return true;
    } catch (error) {
      logWarning("Ambient audio could not start.", error);
      await this.stop();
      return false;
    }
  }

  async stop(): Promise<void> {
    const context = this.context;
    const master = this.master;
    this.running = false;
    if (!context) return;

    try {
      if (master) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), context.currentTime);
        master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + FADE_OUT_SECONDS);
      }
      const nodes = this.nodes;
      this.nodes = [];
      window.setTimeout(() => {
        for (const node of nodes) {
          try {
            node.stop();
            node.disconnect();
          } catch {
            // A node that already stopped throws on a second stop. Nothing to do.
          }
        }
        try {
          master?.disconnect();
        } catch {
          // Already detached.
        }
      }, FADE_OUT_SECONDS * 1000 + 60);
    } catch (error) {
      logWarning("Ambient audio did not stop cleanly.", error);
    } finally {
      this.master = null;
    }
  }

  /** Releases the audio hardware. Call when the scene unmounts. */
  async dispose(): Promise<void> {
    await this.stop();
    const context = this.context;
    this.context = null;
    if (!context) return;
    try {
      await context.close();
    } catch (error) {
      logWarning("Audio context did not close.", error);
    }
  }
}

/** One hum per page. Two scenes fading against each other would beat. */
export const ambientHum = new AmbientHum();

/**
 * AudioManager — Web Audio API based sound system.
 *
 * Plays SFX and background music with independent volume controls.
 * Gracefully handles missing audio files (skips silently).
 * AudioContext is created lazily on first user interaction (browser policy).
 *
 * Expected audio file layout (in public/):
 *   audio/sfx/{name}.mp3    (or .ogg)
 *   audio/music/{name}.mp3  (or .ogg)
 */

const SFX_VOLUME_KEY = 'endead_sfx_volume';
const MUSIC_VOLUME_KEY = 'endead_music_volume';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxBuffers = new Map<string, AudioBuffer>();
  private musicBuffers = new Map<string, AudioBuffer>();
  private currentMusicSource: AudioBufferSourceNode | null = null;
  private currentMusicName: string | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private _sfxVolume: number;
  private _musicVolume: number;
  private _muted = false;
  private initialized = false;

  constructor() {
    this._sfxVolume = parseFloat(localStorage.getItem(SFX_VOLUME_KEY) || '0.7');
    this._musicVolume = parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY) || '0.4');
  }

  /**
   * Initialize AudioContext on first user gesture.
   * Call this from a click/keydown handler.
   */
  public ensureContext(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._muted ? 0 : this._sfxVolume;
      this.sfxGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this._muted ? 0 : this._musicVolume;
      this.musicGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('AudioManager: Failed to create AudioContext', e);
    }
  }

  /**
   * Preload audio assets. Missing files are silently skipped.
   */
  public async loadAssets(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const sfxNames = [
      'dice_roll', 'melee_hit', 'melee_miss', 'ranged_shot', 'ranged_miss',
      'door_open', 'door_break', 'search', 'item_pickup',
      'zombie_spawn', 'zombie_attack', 'survivor_wound', 'survivor_death',
      'footstep', 'objective', 'turn_start',
      'button_click', 'error', 'trade_offer', 'trade_complete',
    ];
    const musicNames = ['menu', 'gameplay_low', 'gameplay_high', 'victory', 'defeat'];

    const loadBuffer = async (path: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(path);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        if (!this.ctx) return null;
        return await this.ctx.decodeAudioData(arrayBuffer);
      } catch {
        return null;
      }
    };

    // We need the AudioContext to decode — ensure it exists
    this.ensureContext();
    if (!this.ctx) return;

    const sfxPromises = sfxNames.map(async (name) => {
      const buffer = await loadBuffer(`/audio/sfx/${name}.mp3`);
      if (buffer) this.sfxBuffers.set(name, buffer);
    });

    const musicPromises = musicNames.map(async (name) => {
      const buffer = await loadBuffer(`/audio/music/${name}.mp3`);
      if (buffer) this.musicBuffers.set(name, buffer);
    });

    await Promise.all([...sfxPromises, ...musicPromises]);
    // Asset loading complete
  }

  public playSFX(name: string): void {
    if (!this.ctx || !this.sfxGain) return;
    const buffer = this.sfxBuffers.get(name);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    source.start();
  }

  public playMusic(name: string, loop = true): void {
    if (!this.ctx || !this.musicGain) return;
    if (this.currentMusicName === name) return; // Already playing

    this.stopMusic();

    const buffer = this.musicBuffers.get(name);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(this.musicGain);
    source.start();

    this.currentMusicSource = source;
    this.currentMusicName = name;
  }

  public stopMusic(): void {
    if (this.currentMusicSource) {
      try {
        this.currentMusicSource.stop();
      } catch { /* already stopped */ }
      this.currentMusicSource = null;
      this.currentMusicName = null;
    }
  }

  // --- Volume ---

  public get sfxVolume(): number { return this._sfxVolume; }
  public get musicVolume(): number { return this._musicVolume; }
  public get muted(): boolean { return this._muted; }

  public setSfxVolume(v: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, v));
    localStorage.setItem(SFX_VOLUME_KEY, String(this._sfxVolume));
    if (this.sfxGain && !this._muted) {
      this.sfxGain.gain.value = this._sfxVolume;
    }
  }

  public setMusicVolume(v: number): void {
    this._musicVolume = Math.max(0, Math.min(1, v));
    localStorage.setItem(MUSIC_VOLUME_KEY, String(this._musicVolume));
    if (this.musicGain && !this._muted) {
      this.musicGain.gain.value = this._musicVolume;
    }
  }

  public toggleMute(): void {
    this._muted = !this._muted;
    if (this.sfxGain) this.sfxGain.gain.value = this._muted ? 0 : this._sfxVolume;
    if (this.musicGain) this.musicGain.gain.value = this._muted ? 0 : this._musicVolume;
  }
}

export const audioManager = new AudioManager();

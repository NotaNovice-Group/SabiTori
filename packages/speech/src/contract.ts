/**
 * Everything that checks the FILES of a pack, without the audio or Piper code. The update client
 * (packages/connect) and the publish/check scripts import this entry ("@sabitori/speech/validate") so a file is
 * judged by the same code before it is installed as when the app loads it.
 */
export { validateManifest, validatePhrases, validateRules, rulesWarnings, isLangTag, isId } from './validate.js';
export { parseAudioIndex, CLIP_EXTENSIONS, MAX_CLIP_ID } from './audio-index.js';
export { PackLoadError } from './errors.js';
export { parsePiperConfig } from './piper/config.js';

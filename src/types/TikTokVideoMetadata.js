class TikTokVideoMetadata {
  static Sources = {
    DIRECT: 'Direct Upload',
    GALLERY: 'Gallery',
    STITCH: 'Stitch',
    UNKNOWN: 'Unknown',
  };

  static TranscodeTypes = {
    SOURCE: 'Original',
    TRANSCODED: 'Transcoded',
    APP: 'App Download',
  };

  static EditorTypes = {
    TIKTOK: 'TikTok App',
    CAPCUT: 'vicut',
    CAPCUT_WEB: 'vicutweb',
  };
}

module.exports = TikTokVideoMetadata;

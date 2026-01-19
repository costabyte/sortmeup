const path = require('node:path');
const TikTokEffectParser = require('../parsers/TikTokEffectParser');
const TikTokMetadata = require('../../types/TikTokVideoMetadata');

class TikTokAnalyzer {
  static EXTENSIONS = ['.mp4', '.mov'];
  static ERROR_PATTERNS =
    /file not supported|no metadata found|timeout|permission denied|unknown file type|not a valid|corrupt/i;

  constructor(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath must be a non-empty string');
    }
    this.filePath = filePath;
  }

  analyze(exifData) {
    const extension = path.extname(this.filePath).toLowerCase();
    if (!TikTokAnalyzer.EXTENSIONS.includes(extension)) return null;

    if (!exifData || typeof exifData !== 'object') return null;

    try {
      if (this.isIOS(exifData)) return this.parseIOS(exifData);
      if (this.isAndroid(exifData)) return this.parseAndroid(exifData);
      if (this.isAppDownload(exifData)) return this.parseAppDownload(exifData);

      return null;
    } catch (err) {
      if (!TikTokAnalyzer.ERROR_PATTERNS.test(err.message)) {
        console.error(`TikTok analysis failed for ${path.basename(this.filePath)}: ${err.message}`);
      }
      return null;
    }
  }

  // isIOS / isAndroid and parseIOS / parseAndroid are based on the metadata found in videos downloaded
  // from the old hidden tikwm [dot] com endpoint which extracted videos in source quality
  // isAppDownload / parseAppDownload are for videos downloaded normally from inside the app

  isIOS(data) {
    if (!data.Software) return false;
    const sw = this.parseJson(data.Software);
    return !!(sw?.source || sw?.publicMode || sw?.transType);
  }

  isAndroid(data) {
    if (!data.Description) return false;

    const desc = this.parseJson(data.Description);
    if (!Array.isArray(desc) || !desc[0]) return false;

    const d = desc[0];

    return !!(d?.make === 'Android' || d?.creationDate || d?.userDevice);
  }

  isAppDownload(data) {
    return data.Comment?.startsWith('vid:') || !!data.Information;
  }

  parseIOS(data) {
    const sw = this.parseJson(data.Software);
    if (!sw) return null;

    const meta = {
      platform: 'iOS',
      isAppleDevice: true,
      source: sw.source || null,
      transType: sw.transType || null,
      isTranscoded: sw.isTranscoded === 1,
      isPublic: sw.publicMode === 1,
      isFastImport: sw.isImported === 1,
      encoder: data.Encoder || null,
    };

    if (data.Information) {
      const info = this.parseJson(data.Information);

      if (info) {
        try {
          meta.editor = TikTokEffectParser.parse(info);
        } catch (e) {
          console.warn(`TikTok effect parser failed: ${e.message}`);
        }
      }
    }

    meta.uploadType = this.parseIOSSource(meta.source);
    return meta;
  }

  parseAndroid(data) {
    const desc = this.parseJson(data.Description);
    if (!Array.isArray(desc) || !desc[0]) return null;

    const d = desc[0];
    const meta = {
      platform: 'Android',
      isAppleDevice: false,
      description: {
        creationDate: d.creationDate || null,
        device: {
          os: d.make || 'Android',
          model: d.userDevice || 'unknown',
          version: d.userSystem || 'unknown',
        },
        video: {
          isDirectRecording: d.appRecord === 1,
          isRecord: d.isRecord === 1,
          isCropped: d.isCropped === 1,
          importPath: d.importPath || '',
          originalResolution: d.videoResolution || null,
          duration: d.videoDuration || null,
        },
      },
      isImported: data.TeIsFastImport === 1,
      isTranscoded: data.TeIsReencode === 1,
      encoder: data.Encoder || null,
    };

    if (data.Information) {
      const info = this.parseJson(data.Information);

      if (info) {
        try {
          const parsed = TikTokEffectParser.parse(info);
          if (parsed) meta.editor = parsed;
        } catch (e) {
          console.warn(`TikTok effect parser failed: ${e.message}`);
        }
      }
    }

    meta.uploadType = this.parseAndroidSource(meta);

    if (data.Comment?.startsWith('vid:')) {
      meta.download = {
        isAppDownload: true,
        videoId: data.Comment.replace('vid:', ''),
      };
    }

    return meta;
  }

  parseAppDownload(data) {
    const meta = {
      encoder: data.Encoder || null,
      download: { isDownloadedFromApp: true },
      uploadType: TikTokMetadata.TranscodeTypes.APP,
    };

    if (data.Comment?.startsWith('vid:')) {
      meta.download.videoId = data.Comment.replace('vid:', '');
    }

    if (data.Information) {
      const info = this.parseJson(data.Information);

      if (info) {
        meta.download.information = info;
        if (info.aigc_label_type !== undefined) {
          meta.aigc = {
            labelType: info.aigc_label_type || 0,
            isAIGenerated: info.aigc_label_type > 0,
          };
        }
      }
    }

    return meta;
  }

  parseIOSSource(src) {
    const val = typeof src === 'string' ? parseInt(src, 10) : src;
    const map = {
      1: TikTokMetadata.Sources.DIRECT,
      2: TikTokMetadata.Sources.STITCH,
      5: TikTokMetadata.Sources.GALLERY,
    };
    return map[val] || TikTokMetadata.Sources.UNKNOWN;
  }

  parseAndroidSource(meta) {
    const { description } = meta;
    if (!description?.video) return TikTokMetadata.Sources.UNKNOWN;

    const { video } = description;
    if ((description.appRecord === 1 && !video.importPath) || video.isDirectRecording) {
      return TikTokMetadata.Sources.DIRECT;
    }

    if (meta.isImported || video.importPath) {
      return TikTokMetadata.Sources.GALLERY;
    }

    return TikTokMetadata.Sources.UNKNOWN;
  }

  parseJson(str) {
    if (!str || typeof str !== 'string') return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }
}

module.exports = TikTokAnalyzer;

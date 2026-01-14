const { promises: fs } = require('node:fs');
const path = require('node:path');
const TikTokAnalyzer = require('./TikTokAnalyzer');

class GalleryAnalyzer {
  static FILE_FORMATS = {
    IMAGES: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.dng', '.gif', '.tif'],
    VIDEOS: ['.mp4', '.mov', '.webm'],
  };

  static DATE_WEIGHTS = {
    TIKTOK: 10,
    EXIF_ORIGINAL: 10,
    DATE_CREATED: 9,
    CREATION_DATE: 9,
    FILENAME: 7,
  };

  static DATE_PATTERNS = [
    /(\d{4})-(\d{2})-(\d{2})[_\s-](\d{2})[_\s-](\d{2})[_\s-](\d{2})/,
    /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
    /IMG[_-](\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
  ];

  static DATE_RANGE = {
    MIN: new Date('1990-01-01'),
    MAX_OFFSET_MS: 365 * 86400000,
  };

  static ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  static EXIF_DATE_REGEX = /(\d{4}):(\d{2}):(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/;

  constructor(file, exifTool) {
    if (!file || typeof file !== 'string') {
      throw new Error('file must be a non-empty string');
    }
    this.file = file;
    this.name = path.basename(file);
    this.ext = path.extname(file).toLowerCase();
    this.exifTool = exifTool;
  }

  async analyze() {
    try {
      const isImage = GalleryAnalyzer.FILE_FORMATS.IMAGES.includes(this.ext);
      const isVideo = GalleryAnalyzer.FILE_FORMATS.VIDEOS.includes(this.ext);
      if (!isImage && !isVideo) return null;

      const raw = await this.exifTool.read(this.file);

      const exif = {
        dateOriginal: this.parseDate(raw.DateTimeOriginal),
        creationDate: this.parseDate(raw.CreationDate),
        dateCreated: this.parseDate(raw.DateCreated),
        make: raw.Make,
        model: raw.Model,
        software: raw.Software,
        userComment: raw.UserComment,
        specialInstructions: raw.SpecialInstructions,
        author: raw.Author,
      };

      // pass raw exif data to TikTokAnalyzer
      let tiktok = null;
      if (isVideo) {
        try {
          const analyzer = new TikTokAnalyzer(this.file);
          tiktok = analyzer.analyze(raw);
          if (tiktok?.description?.creationDate) {
            tiktok.description.creationDate = this.parseDate(tiktok.description.creationDate);
          }
        } catch (err) {
          console.warn(`TikTok analysis failed for ${this.name}: ${err.message}`);
        }
      }

      const date = this.resolveDate(exif, tiktok);

      return {
        path: this.file,
        name: this.name,
        type: isVideo ? 'video' : 'image',
        date,
        content: {
          isScreenshot: exif.userComment === 'Screenshot',
          isiPhoneGalleryRoll: exif.make === 'Apple' && exif.model?.includes('iPhone'),
          isScreenRecording: isVideo && exif.author === 'ReplayKitRecording',
          isTikTokVideo: !!tiktok,
          isInstagramImage: exif.software === 'Instagram' || exif.specialInstructions?.includes('FBMD'),
        },
      };
    } catch (err) {
      console.warn(`Analysis failed for ${this.name}: ${err.message}`);
      return this.fallback();
    }
  }

  resolveDate(exif, tiktok) {
    const candidates = [
      { date: tiktok?.description?.creationDate, weight: GalleryAnalyzer.DATE_WEIGHTS.TIKTOK },
      { date: exif.dateOriginal, weight: GalleryAnalyzer.DATE_WEIGHTS.EXIF_ORIGINAL },
      { date: exif.dateCreated, weight: GalleryAnalyzer.DATE_WEIGHTS.DATE_CREATED },
      { date: exif.creationDate, weight: GalleryAnalyzer.DATE_WEIGHTS.CREATION_DATE },
    ];

    const fnDate = this.extractFilenameDate();
    if (fnDate) candidates.push({ date: fnDate, weight: GalleryAnalyzer.DATE_WEIGHTS.FILENAME });

    // calculate bounds once
    const now = Date.now();
    const maxDate = now + GalleryAnalyzer.DATE_RANGE.MAX_OFFSET_MS;
    const minTime = GalleryAnalyzer.DATE_RANGE.MIN.getTime();

    const valid = candidates
      .filter(c => {
        if (!this.isValid(c.date)) return false;
        const t = c.date.getTime();
        return t >= minTime && t <= maxDate;
      })
      .sort((a, b) => b.weight - a.weight);

    return valid.length > 0 ? valid[0].date : this.getFsDate();
  }

  extractFilenameDate() {
    for (const pattern of GalleryAnalyzer.DATE_PATTERNS) {
      const match = this.name.match(pattern);
      if (match) {
        try {
          const [, y, m, d, h = 0, min = 0, s = 0] = match;
          const date = new Date(y, m - 1, d, h, min, s);
          if (this.isValid(date)) return date;
        } catch {}
      }
    }
    return null;
  }

  async fallback() {
    return {
      path: this.file,
      name: this.name,
      type: GalleryAnalyzer.FILE_FORMATS.IMAGES.includes(this.ext) ? 'image' : 'video',
      date: await this.getFsDate(),
      content: {
        isScreenshot: false,
        isiPhoneGalleryRoll: false,
        isScreenRecording: false,
        isTikTokVideo: false,
        isInstagramImage: false,
      },
    };
  }

  async getFsDate() {
    try {
      const { birthtime, mtime } = await fs.stat(this.file);
      const validBirth = this.isValid(birthtime);
      const validMtime = this.isValid(mtime);

      if (validBirth && validMtime) {
        const date = birthtime < mtime ? birthtime : mtime;
        const t = date.getTime();
        const minTime = GalleryAnalyzer.DATE_RANGE.MIN.getTime();
        const maxTime = Date.now() + GalleryAnalyzer.DATE_RANGE.MAX_OFFSET_MS;
        if (t >= minTime && t <= maxTime) return date;
      }

      if (validBirth) return birthtime;
      if (validMtime) return mtime;
    } catch {}

    return new Date();
  }

  isValid(date) {
    return date instanceof Date && !isNaN(date.getTime());
  }

  parseDate(date) {
    if (date == null) return null;

    try {
      if (date instanceof Date) return this.isValid(date) ? date : null;

      // exiftool date object format
      if (date && typeof date === 'object' && typeof date.year === 'number') {
        const d = new Date(date.year, date.month - 1, date.day, date.hour || 0, date.minute || 0, date.second || 0);
        return this.isValid(d) ? d : null;
      }

      if (typeof date === 'number') {
        const ms = new Date(date);
        if (this.isValid(ms) && ms.getFullYear() > 1990) return ms;

        const sec = new Date(date * 1000);
        if (this.isValid(sec) && sec.getFullYear() > 1990) return sec;

        return null;
      }

      if (typeof date !== 'string') return null;

      const str = date.trim();
      if (!str) return null;

      // ISO 8601
      if (GalleryAnalyzer.ISO8601_REGEX.test(str)) return new Date(str);

      // EXIF format (YYYY:MM:DD HH:MM:SS)
      const match = str.match(GalleryAnalyzer.EXIF_DATE_REGEX);
      if (match) {
        const [, y, m, d, h = 0, min = 0, s = 0] = match;
        const parsed = new Date(y, m - 1, d, h, min, s);
        return this.isValid(parsed) ? parsed : null;
      }

      return null;
    } catch {
      return null;
    }
  }
}

module.exports = GalleryAnalyzer;

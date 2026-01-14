const path = require('node:path');
const OrganizationManager = require('../../gallery/managers/OrganizationManager');

class GalleryOrganizer {
  static CONFIG = {
    DEFAULT_CONCURRENCY: 10,
  };

  static MEDIA_EXTENSIONS = /\.(jpg|jpeg|png|heic|heif|webp|mp4|mov|webm|dng|gif|tif)$/i;

  static PROCESSING_FOLDERS = {
    FAILED: 'Failed',
    DUPLICATES: 'Duplicates',
  };

  static CONTENT_CATEGORIES = {
    SCREENSHOTS: 'Screenshots',
    SCREEN_RECORDINGS: 'Screen Recordings',
    SOCIAL_TIKTOK: path.join('Social', 'TikTok'),
    SOCIAL_INSTAGRAM: path.join('Social', 'Instagram'),
    VIDEOS: 'Videos',
    PHOTOS: 'Photos',
    OTHER: 'Other',
  };

  constructor(options = {}) {
    this.validateOptions(options);
    this.initConfig(options);
    this.initState();
  }

  validateOptions(options) {
    if (!options.sourceDir || typeof options.sourceDir !== 'string') {
      throw new Error('sourceDir is required');
    }

    if (options.concurrency !== undefined && (!Number.isInteger(options.concurrency) || options.concurrency < 1)) {
      throw new Error('concurrency must be a positive integer');
    }
  }

  async organize() {
    const manager = new OrganizationManager(
      this,
      GalleryOrganizer.CONFIG,
      GalleryOrganizer.PROCESSING_FOLDERS,
      GalleryOrganizer.CONTENT_CATEGORIES,
    );

    try {
      await manager.run();
    } finally {
      await manager.destroy();
    }
  }

  initConfig(options) {
    this.sourceDir = path.resolve(options.sourceDir);
    this.targetDir = options.targetDir ? path.resolve(options.targetDir) : path.join(this.sourceDir, 'Organized');
    this.dryRun = Boolean(options.dryRun);
    this.preserveOriginals = Boolean(options.preserveOriginals);
    this.concurrency = options.concurrency || GalleryOrganizer.CONFIG.DEFAULT_CONCURRENCY;
  }

  initState() {
    this.stats = {
      processed: 0,
      moved: 0,
      duplicates: 0,
      errors: 0,
      analysisFailures: 0,
      startTime: null,
    };

    this.dryRunStats = {
      directoriesWouldCreate: new Set(),
      filesWouldMove: [],
      duplicatesWouldHandle: [],
      categorization: new Map(),
    };

    this.createdDirs = new Set();
  }

  chunk(arr, size) {
    if (!arr.length || size >= arr.length) return [arr];
    const result = [];

    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }

    return result;
  }

  isMedia(name) {
    return GalleryOrganizer.MEDIA_EXTENSIONS.test(name);
  }

  formatName(date, ext) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}.${min}.${s}${ext}`;
  }

  makeUniquePath(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    return path.join(dir, `${base}_${Date.now()}${ext}`);
  }

  printSummary() {
    const duration = (Date.now() - this.stats.startTime) / 1000;
    const speed = this.stats.processed > 0 ? (this.stats.processed / duration).toFixed(1) : '0';

    console.log('\n------- Summary -------');

    if (this.dryRun) {
      console.log('DRY RUN - No files were moved');
      console.log(`Files analyzed: ${this.stats.processed}`);
      console.log(`Would move: ${this.dryRunStats.filesWouldMove.length} files`);
      console.log(`Would create: ${this.dryRunStats.directoriesWouldCreate.size} directories`);

      if (this.dryRunStats.categorization.size > 0) {
        console.log('\nBy category:');
        for (const [cat, count] of this.dryRunStats.categorization) {
          console.log(`  ${cat}: ${count}`);
        }
      }

      if (this.dryRunStats.filesWouldMove.length > 0) {
        console.log('\nSample moves:');

        const samples = this.dryRunStats.filesWouldMove.slice(0, 5);
        samples.forEach(({ originalName, category, newName }) => {
          console.log(`  ${originalName} → ${category}/${newName}`);
        });

        if (this.dryRunStats.filesWouldMove.length > 5) {
          console.log(`  ... +${this.dryRunStats.filesWouldMove.length - 5} more`);
        }
      }
    } else {
      console.log(`Processed ${this.stats.processed} files`);
      console.log(`Moved ${this.stats.moved} files`);

      if (this.stats.duplicates > 0) console.log(`Duplicates: ${this.stats.duplicates}`);
      if (this.stats.errors > 0) console.log(`Errors: ${this.stats.errors}`);
    }

    if (this.stats.analysisFailures > 0) console.log(`Analysis failures: ${this.stats.analysisFailures}`);
    console.log(`Time: ${duration.toFixed(1)}s (${speed} files/sec)`);
  }
}

module.exports = GalleryOrganizer;

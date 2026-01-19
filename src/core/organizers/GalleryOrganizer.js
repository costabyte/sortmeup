const path = require('node:path');
const OrganizationManager = require('../../gallery/managers/OrganizationManager');

class GalleryOrganizer {
  static CONFIG = {
    DEFAULT_CONCURRENCY: 10,
  };

  static EXTENSIONS = /\.(jpg|jpeg|png|heic|heif|webp|mp4|mov|webm|dng|gif|tif)$/i;

  static PROCESSING_FOLDERS = {
    FAILED: 'Failed',
    DUPLICATES: 'Duplicates',
  };

  static CATEGORIES = {
    SCREENSHOTS: 'Screenshots',
    SCREEN_RECORDINGS: 'Screen Recordings',
    SOCIAL_TIKTOK: path.join('Social', 'TikTok'),
    SOCIAL_INSTAGRAM: path.join('Social', 'Instagram'),
    VIDEOS: 'Videos',
    PHOTOS: 'Photos',
    OTHER: 'Other',
  };

  constructor(options = {}) {
    this.checkOptions(options);
    this.initConfig(options);
    this.initState();
  }

  checkOptions(options) {
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
      GalleryOrganizer.CATEGORIES,
    );

    try {
      await manager.run();
    } finally {
      await manager.destroy();
    }
  }

  initConfig(options) {
    this.sourceDir = path.resolve(options.sourceDir);

    // set default targetDir as sibling directory to prevent conflicts
    if (options.targetDir) {
      this.targetDir = path.resolve(options.targetDir);
    } else {
      const parentDir = path.dirname(this.sourceDir);
      const sourceDir = path.basename(this.sourceDir);
      this.targetDir = path.join(parentDir, `${sourceDir}_organized`);
    }

    // make sure that targetDir is not within sourceDir to prevent conflicts (again)
    const target = this.targetDir + path.sep;
    const source = this.sourceDir + path.sep;

    if (target.startsWith(source)) {
      throw new Error('targetDir must not be within sourceDir to prevent conflicts');
    }

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
      failureDetails: [],
    };

    this.dryRunStats = {
      directories: new Set(),
      files: [],
      duplicates: [],
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
    return GalleryOrganizer.EXTENSIONS.test(name);
  }

  formatName(date, ext) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}.${minute}.${second}${ext}`;
  }

  makeUniquePath(filePath) {
    const dir = path.dirname(filePath);
    const extension = path.extname(filePath);
    const base = path.basename(filePath, extension);
    return path.join(dir, `${base}_${Date.now()}${extension}`);
  }

  showSummary() {
    const duration = (Date.now() - this.stats.startTime) / 1000;
    const speed = this.stats.processed > 0 ? (this.stats.processed / duration).toFixed(1) : '0';

    console.log('\n=========== SUMMARY ===========');

    if (this.dryRun) {
      console.log('DRY RUN - No files were moved!');
      console.log(`Files analyzed: ${this.stats.processed}`);
      console.log(`Would move: ${this.dryRunStats.files.length} files`);
      console.log(`Would create: ${this.dryRunStats.directories.size} directories`);

      if (this.dryRunStats.categorization.size > 0) {
        console.log('\nBy category:');
        for (const [cat, count] of this.dryRunStats.categorization) {
          console.log(`  ${cat}: ${count}`);
        }
      }

      if (this.dryRunStats.files.length > 0) {
        console.log('\nSample moves:');

        const samples = this.dryRunStats.files.slice(0, 5);
        samples.forEach(({ originalName, category, newName }) => {
          console.log(`  ${originalName} -> ${category}/${newName}`);
        });

        if (this.dryRunStats.files.length > 5) {
          console.log(`  ... and ${this.dryRunStats.files.length - 5} more`);
        }
      }
    } else {
      console.log(`Processed ${this.stats.processed} files`);
      console.log(`Moved ${this.stats.moved} files`);

      if (this.stats.duplicates > 0) console.log(`Duplicates: ${this.stats.duplicates}`);
      if (this.stats.errors > 0) console.log(`Errors: ${this.stats.errors}`);
    }

    if (this.stats.analysisFailures > 0) {
      console.log(`Analysis fails: ${this.stats.analysisFailures}`);

      if (this.stats.failureDetails.length > 0) {
        console.log('\nFailure details:');
        const maxFails = 10;
        const failures = this.stats.failureDetails.slice(0, maxFails);

        failures.forEach(({ filename, error, timestamp }) => {
          const time = new Date(timestamp).toLocaleTimeString();
          console.log(`  [${time}] ${filename}: ${error}`);
        });

        if (this.stats.failureDetails.length > maxFails) {
          console.log(`  ... +${this.stats.failureDetails.length - maxFails} more fails`);
        }
      }
    }

    console.log(`Time: ${duration.toFixed(1)}s (${speed} files/sec)`);
  }
}

module.exports = GalleryOrganizer;

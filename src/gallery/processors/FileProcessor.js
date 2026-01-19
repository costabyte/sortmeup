const path = require('node:path');
const { promises: fs } = require('node:fs');
const GalleryAnalyzer = require('../../core/analyzers/GalleryAnalyzer');

class FileProcessor {
  static MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  constructor(organizer, resourceManager, config, folders, categories) {
    this.organizer = organizer;
    this.resourceManager = resourceManager;
    this.folders = folders;
    this.categories = categories;
    this.processedPaths = new Set();
  }

  async sortBatch(files) {
    const total = files.length;

    // dynamic import for ESM-only p-limit v7
    // i skidded this from the internet
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(this.organizer.concurrency);

    let lastLog = 0;

    const promises = files.map(file =>
      limit(async () => {
        await this.sortFile(file);

        const processed =
          this.organizer.stats.processed + this.organizer.stats.errors + this.organizer.stats.analysisFailures;

        if (processed - lastLog >= 100) {
          console.log(`Progress: ${processed}/${total} files (${Math.round((processed / total) * 100)}%)`);
          lastLog = processed;
        }
      }),
    );

    await Promise.all(promises);
  }

  async sortFile(file) {
    const filename = path.basename(file);

    try {
      const analyzer = new GalleryAnalyzer(file, this.resourceManager.getExifTool());
      const data = await analyzer.analyze();

      if (data?.error) {
        this.organizer.stats.analysisFailures++;
        this.captureFailure(filename, data.error);
        await this.moveFailedFile(file);
        return;
      }

      if (!data) {
        this.organizer.stats.analysisFailures++;
        this.captureFailure(filename, 'Analysis returned no data');
        await this.moveFailedFile(file);
        return;
      }

      const target = this.buildFilePath(data);
      await this.moveToTarget(file, target, data);
      this.organizer.stats.processed++;
    } catch (err) {
      console.warn(`Failed: ${filename}: ${err.message}`);
      this.organizer.stats.errors++;
      this.captureFailure(filename, err.message);
    }
  }

  captureFailure(file, error) {
    this.organizer.stats.failureDetails.push({
      file,
      error,
      timestamp: Date.now(),
    });
  }

  async moveFailedFile(file) {
    const name = path.basename(file);
    const dir = path.join(this.organizer.targetDir, '_Processing', this.folders.FAILED);
    const target = path.join(dir, name);

    if (this.organizer.dryRun) {
      this.organizer.dryRunStats.directories.add(dir);
      this.organizer.dryRunStats.files.push({
        source: file,
        target,
        category: 'Failed',
        originalName: name,
        newName: name,
      });
    } else {
      await this.ensureDirectory(dir);
      await this.moveFile(file, target);
      this.organizer.stats.moved++;
    }
  }

  buildFilePath(data) {
    const category = this.getCategory(data);
    const dateDir = path.join(String(data.date.getFullYear()), FileProcessor.MONTHS[data.date.getMonth()]);
    const name = this.organizer.formatName(data.date, path.extname(data.name));
    return path.join(this.organizer.targetDir, category, dateDir, name);
  }

  getCategory(data) {
    const { content, type } = data;

    if (content.isScreenshot) return this.categories.SCREENSHOTS;
    if (content.isScreenRecording) return this.categories.SCREEN_RECORDINGS;
    if (content.isTikTokVideo) return this.categories.SOCIAL_TIKTOK;
    if (content.isInstagramImage) return this.categories.SOCIAL_INSTAGRAM;
    if (type === 'video') return this.categories.VIDEOS;
    if (type === 'image') return this.categories.PHOTOS;

    return this.categories.OTHER;
  }

  async moveToTarget(source, target, data) {
    if (this.organizer.dryRun) {
      await this.recordDryRun(source, target, data);
      return;
    }

    await this.ensureDirectory(path.dirname(target));

    if (await this.doesFileExist(target)) {
      target = this.handleDupe(source, target);
    }

    await this.moveFile(source, target);
    this.organizer.stats.moved++;
  }

  async recordDryRun(source, target, data) {
    const category = this.getCategory(data);

    this.organizer.dryRunStats.files.push({
      source,
      target,
      category,
      originalName: path.basename(source),
      newName: path.basename(target),
    });

    this.organizer.dryRunStats.directories.add(path.dirname(target));
    this.organizer.dryRunStats.categorization.set(
      category,
      (this.organizer.dryRunStats.categorization.get(category) || 0) + 1,
    );

    if (await this.doesFileExist(target)) {
      this.organizer.stats.duplicates++;
      this.organizer.dryRunStats.duplicates.push({ source: source, target, strategy: this.organizer.strategy });
    }
  }

  async ensureDirectory(dir) {
    if (!this.organizer.createdDirs.has(dir)) {
      await fs.mkdir(dir, { recursive: true });
      this.organizer.createdDirs.add(dir);
    }
  }

  async doesFileExist(file) {
    if (this.processedPaths.has(file)) return true;
    try {
      await fs.stat(file);
      return true;
    } catch {
      return false;
    }
  }

  handleDupe(src, target) {
    this.organizer.stats.duplicates++;

    const unique = this.organizer.makeUniquePath(target);
    console.log(`Duplicate: ${path.basename(src)} -> ${path.basename(unique)}`);
    return unique;
  }

  // what the fuck is this code
  async moveFile(src, target) {
    if (this.organizer.preserveOriginals) {
      await fs.copyFile(src, target);
    } else {
      try {
        await fs.rename(src, target);
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fs.copyFile(src, target);
          await fs.unlink(src);
        } else {
          throw err;
        }
      }
    }
    this.processedPaths.add(target);
  }
}

module.exports = FileProcessor;

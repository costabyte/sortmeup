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

  // semaphore worker pool
  async processBatch(files) {
    const limit = this.organizer.concurrency;
    let active = 0;
    let idx = 0;
    const total = files.length;
    let lastLog = 0;

    const next = () => {
      while (active < limit && idx < total) {
        active++;
        const file = files[idx++];
        this.processFile(file).finally(() => {
          active--;
          next();
        });
      }
    };

    return new Promise(resolve => {
      const check = setInterval(() => {
        const processed =
          this.organizer.stats.processed + this.organizer.stats.errors + this.organizer.stats.analysisFailures;

        if (processed - lastLog >= 100) {
          console.log(`Progress: ${processed}/${total} files (${Math.round((processed / total) * 100)}%)`);
          lastLog = processed;
        }

        if (idx >= total && active === 0) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      next();
    });
  }

  async processFile(file) {
    try {
      const analyzer = new GalleryAnalyzer(file, this.resourceManager.getExifTool());
      const data = await analyzer.analyze();

      if (!data) {
        this.organizer.stats.analysisFailures++;
        await this.moveFailedFile(file);
        return;
      }

      const target = this.buildFilePath(data);
      await this.moveToTarget(file, target, data);
      this.organizer.stats.processed++;
    } catch (err) {
      console.warn(`Failed: ${path.basename(file)}: ${err.message}`);
      this.organizer.stats.errors++;
    }
  }

  async moveFailedFile(file) {
    const name = path.basename(file);
    const dir = path.join(this.organizer.targetDir, '_Processing', this.folders.FAILED);
    const dest = path.join(dir, name);

    if (this.organizer.dryRun) {
      this.organizer.dryRunStats.directories.add(dir);
      this.organizer.dryRunStats.files.push({
        source: file,
        target: dest,
        category: 'Failed',
        originalName: name,
        newName: name,
      });
    } else {
      await this.ensureDirectory(dir);
      await this.moveFile(file, dest);
      this.organizer.stats.moved++;
    }
  }

  buildFilePath(data) {
    const cat = this.getCategory(data);
    const dateDir = path.join(String(data.date.getFullYear()), FileProcessor.MONTHS[data.date.getMonth()]);
    const name = this.organizer.formatName(data.date, path.extname(data.name));
    return path.join(this.organizer.targetDir, cat, dateDir, name);
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

  async moveToTarget(src, target, data) {
    if (this.organizer.dryRun) {
      await this.recordDryRun(src, target, data);
      return;
    }

    await this.ensureDirectory(path.dirname(target));

    if (await this.doesFileExist(target)) {
      target = this.handleDupe(src, target);
    }

    await this.moveFile(src, target);
    this.organizer.stats.moved++;
  }

  async recordDryRun(src, target, data) {
    const cat = this.getCategory(data);

    this.organizer.dryRunStats.files.push({
      source: src,
      target,
      category: cat,
      originalName: path.basename(src),
      newName: path.basename(target),
    });

    this.organizer.dryRunStats.directories.add(path.dirname(target));
    this.organizer.dryRunStats.categorization.set(cat, (this.organizer.dryRunStats.categorization.get(cat) || 0) + 1);

    if (await this.doesFileExist(target)) {
      this.organizer.stats.duplicates++;
      this.organizer.dryRunStats.duplicates.push({ source: src, target, strategy: this.organizer.strategy });
    }
  }

  async ensureDirectory(dir) {
    if (!this.organizer.createdDirs.has(dir)) {
      await fs.mkdir(dir, { recursive: true });
      this.organizer.createdDirs.add(dir);
    }
  }

  // how the FUCK DO I NAME THIS
  async doesFileExist(file) {
    if (this.processedPaths.has(file)) return true;
    try {
      await fs.access(file);
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

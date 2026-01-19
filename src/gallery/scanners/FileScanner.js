const path = require('node:path');
const { promises: fs } = require('node:fs');

class FileScanner {
  constructor(organizer) {
    this.organizer = organizer;
  }

  async scan() {
    return await this.scanDirectory(this.organizer.sourceDir, []);
  }

  async scanDirectory(dir, files) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const { dirs, media } = this.categorizeFiles(entries, dir);

      files.push(...media);

      if (dirs.length > 0) {
        await this.scanBatch(dirs, files);
      }
      return files;
    } catch (err) {
      console.warn(`Scan failed for ${dir}: ${err.message}`);
      return files;
    }
  }

  categorizeFiles(entries, dir) {
    const dirs = [];
    const media = [];

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (full !== this.organizer.targetDir) {
          dirs.push(full);
        }
      } else if (entry.isFile() && this.organizer.isMedia(entry.name)) {
        media.push(full);
      }
    }

    return { dirs, media };
  }

  async scanBatch(dirs, files) {
    const size = Math.min(this.organizer.concurrency, dirs.length);
    const batches = this.organizer.chunk(dirs, size);

    for (const batch of batches) {
      const results = await Promise.allSettled(batch.map(d => this.scanDirectory(d, [])));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          files.push(...result.value);
        }
      }
    }
  }
}

module.exports = FileScanner;

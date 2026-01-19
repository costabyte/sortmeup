const { promises: fs } = require('node:fs');
const path = require('node:path');

class DirectoryManager {
  constructor(organizer, folders) {
    this.organizer = organizer;
    this.folders = folders;
  }

  async ensureStructure() {
    const dirs = [
      path.join(this.organizer.targetDir, '_Processing', this.folders.FAILED),
      path.join(this.organizer.targetDir, '_Processing', this.folders.DUPLICATES),
    ];
    await Promise.all(dirs.map(d => this.ensureDirectory(d)));
  }

  async ensureDirectory(dir) {
    if (this.organizer.createdDirs.has(dir)) return;
    try {
      await fs.mkdir(dir, { recursive: true });
      this.organizer.createdDirs.add(dir);
    } catch (err) {
      console.warn(`Failed to create ${dir}: ${err.message}`);
      throw err;
    }
  }

  async removeEmptyDirectories(dir) {
    try {
      const entries = await fs.readdir(dir);

      if (entries.length === 0) {
        await fs.rmdir(dir);
        return;
      }

      // parallelize stat operations
      const subdirs = await this.getSubdirectories(dir, entries);

      if (subdirs.length > 0) {
        await Promise.allSettled(subdirs.map(sub => this.removeEmptyDirectories(sub)));

        // gotta recheck after recursion or we leave empty directories everywhere
        // subdirs might have been the only thing in this dir, so it's empty now too
        const remaining = await fs.readdir(dir);
        if (remaining.length === 0) {
          await fs.rmdir(dir);
        }
      }
    } catch {}
  }

  // parallelized stat operations
  async getSubdirectories(parent, entries) {
    const results = await Promise.all(
      entries.map(async entry => {
        const full = path.join(parent, entry);
        try {
          const stat = await fs.stat(full);
          return stat.isDirectory() ? full : null;
        } catch {
          return null;
        }
      }),
    );
    return results.filter(Boolean);
  }
}

module.exports = DirectoryManager;

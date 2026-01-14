const os = require('node:os');
const { ExifTool } = require('exiftool-vendored');
const DirectoryManager = require('./DirectoryManager');
const FileProcessor = require('../processors/FileProcessor');
const FileScanner = require('../scanners/FileScanner');

class OrganizationManager {
  constructor(organizer, config, folders, categories) {
    this.organizer = organizer;
    this.exifTool = null;
    this.fileProcessor = null;
    this.directoryManager = new DirectoryManager(organizer, folders);
    this.folders = folders;
    this.categories = categories;
  }

  async run() {
    this.organizer.stats.startTime = Date.now();

    try {
      this.logStart();
      await this.initExifTool();

      this.fileProcessor = new FileProcessor(this.organizer, this, null, this.folders, this.categories);

      const files = await this.scan();
      console.log(`Found ${files.length} media files`);

      await this.fileProcessor.processBatch(files);
      await this.postCleanup();

      this.organizer.printSummary();
    } catch (err) {
      console.error('Organization failed:', err.message);
      throw err;
    }
  }

  async initExifTool() {
    console.log('Initializing ExifTool...');

    this.exifTool = new ExifTool({
      maxProcs: Math.max(4, os.cpus().length),
      taskTimeoutMillis: 30000,
      minDelayBetweenSpawnMillis: 10,
      maxTasksPerProcess: 500,
    });
  }

  getExifTool() {
    return this.exifTool;
  }

  async destroy() {
    if (this.exifTool) {
      await this.exifTool.end().catch(err => console.warn('ExifTool cleanup failed:', err.message));
      this.exifTool = null;
    }
  }

  logStart() {
    const o = this.organizer;

    console.log('Starting organization');
    console.log(`Source: ${o.sourceDir}`);
    console.log(`Target: ${o.targetDir}`);
    console.log(`Mode: ${o.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Concurrency: ${o.concurrency}`);
  }

  async scan() {
    await this.directoryManager.ensureStructure();
    const scanner = new FileScanner(this.organizer);
    return await scanner.scan();
  }

  async postCleanup() {
    console.log('Cleaning up empty directories...');

    if (!this.organizer.dryRun) {
      await this.directoryManager.removeEmptyDirectories(this.organizer.sourceDir);
    }
  }
}

module.exports = OrganizationManager;

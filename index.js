const GalleryOrganizer = require('./src/core/organizers/GalleryOrganizer');

async function organize() {
  const organizer = new GalleryOrganizer({
    sourceDir: '',
    targetDir: '',
    concurrency: 50,
    dryRun: true,
    strategy: 'rename',
    verbose: true,
  });

  await organizer.organize();
}

organize().catch(console.error);

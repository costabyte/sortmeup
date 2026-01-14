const GalleryOrganizer = require('./src/core/organizers/GalleryOrganizer');

async function organize() {
  const organizer = new GalleryOrganizer({
    sourceDir: '',
    targetDir: '',
    concurrency: 50,
    strategy: 'rename',
    verbose: true,
  });

  const organize = await organizer.organize();
  console.log(organize);
}

organize().catch(console.error);

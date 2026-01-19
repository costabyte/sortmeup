# SortMeUp

A tool that organizes your phone gallery backups by date and content type. Also extracts metadata from photos/videos and sorts them into a clean directory structure.

## What it does

SortMeUp takes photos and videos, reads their metadata, and organizes them with the following structure:

```
Photos/
  2024/
    January/
      2024-01-15 14.32.45.jpg
      2024-01-15 14.32.47.jpg
    February/
      ...
Screenshots/
  2024/
    March/
      ...
TikTok/
  2024/
    ...
```

The program handles:

- Normal photos and videos
- Screenshots
- TikTok videos (also extracts platform-specific metadata depending on source)
- Instagram images
- Screen recordings
- Date extraction from EXIF, filename patterns and filesystem dates

## Supported formats

- Images: jpg, jpeg, png, webp, heic, heif, dng, gif, tif
- Videos: mp4, mov, webm

## Usage

Here is a basic example:

```javascript
const GalleryOrganizer = require('./src/core/organizers/GalleryOrganizer');

const organizer = new GalleryOrganizer({
  sourceDir: '', // fill your source path here
  targetDir: '', // fill your target path here
  concurrency: 50,
  dryRun: true, // test first!
  strategy: 'rename',
  verbose: true,
});

await organizer.organize();
```

or edit `index.js` and run:

```bash
node index.js
```

## Notes

- Always run with `dryRun: true` first to preview what will happen.
- The program uses p-limit for concurrency. Don't set concurrency too high, or you'll hammer your disk. 50 is reasonable for most systems, 100+ on fast SSDs.

## Limitations

- Doesn't handle corrupted files gracefully (they go to \_Processing/Failed)
- Date parsing is best-effort (some files might have wrong dates!)
- TikTok metadata extraction only works for specific download sources
- No duplicate detection by content hash for now, only filename

## Troubleshooting

### "pLimit is not a function"

p-limit v7+ is ESM only, so the code uses a dynamic import to handle this. If you're seeing this error, make sure you're on Node.js 18+.

### Files going to "Failed" folder

Check the failure details in the summary output. Common causes are corrupted files, filesystem permission issues or general ExifTool errors.

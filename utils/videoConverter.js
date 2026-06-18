import * as FileSystem from 'expo-file-system';

import { FFmpegKit }
from 'ffmpeg-kit-react-native';

// =========================
// CONVERT VIDEO TO
// 1080 x 1920 (9:16)
// =========================

export const convertVideoToReelSize =
  async (videoUri) => {

    try {

      // OUTPUT PATH
      const outputPath =
        FileSystem.cacheDirectory +
        `reel_${Date.now()}.mp4`;

      // FFMPEG COMMAND
      const command = `
      -i "${videoUri}"
      -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
      -c:v libx264
      -preset ultrafast
      -crf 23
      -c:a aac
      "${outputPath}"
      `;

      // EXECUTE
      await FFmpegKit.execute(command);

      console.log(
        'Video Converted:',
        outputPath
      );

      return outputPath;

    } catch (error) {

      console.log(
        'Video Convert Error:',
        error
      );

      return null;

    }

};
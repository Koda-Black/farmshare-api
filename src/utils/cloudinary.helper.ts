// utils/cloudinary.helper.ts
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export const streamUpload = (cloudinaryClient, buffer: Buffer) =>
  new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinaryClient.uploader.upload_stream(
      {
        folder: 'avatars',
        transformation: [
          { width: 500, height: 500, crop: 'limit', fetch_format: 'auto' },
          { quality: 'auto:eco' },
          { flags: 'sanitize' },
        ],
      },
      (error, result) => {
        if (error || !result)
          return reject(error || new Error('Upload failed'));
        resolve(result);
      },
    );
    stream.end(buffer);
  });

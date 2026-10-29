import multer from 'multer';

export function errorHandler({ maxUploadBytes }) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ error: 'That URL slug already exists. Choose a different slug.' });
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Images must be ${maxUploadBytes / 1024 / 1024} MB or smaller.`
          : 'Upload one image at a time.';
      return res.status(400).json({ error: message });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request contains invalid JSON.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'This post is too large. Reduce the body text.' });
    }

    const status = error.status || 500;
    const message = error.status
      ? error.message
      : 'The server could not complete the request. Please try again.';
    res.status(status).json({ error: message });
  };
}

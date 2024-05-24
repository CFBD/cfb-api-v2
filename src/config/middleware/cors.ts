import cors from 'cors';

const env = process.env.NODE_ENV;
const corsOrigin = process.env.CORS_ORIGIN;

let corsOptions: cors.CorsOptions = {};

if (env != 'development') {
  corsOptions = {
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || requestOrigin == corsOrigin) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${requestOrigin}`));
      }
    },
  };
}

const corsConfig = cors(corsOptions);

export default corsConfig;

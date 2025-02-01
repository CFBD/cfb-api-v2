import cors from 'cors';

const env = process.env.NODE_ENV;
const corsOrigin = process.env.CORS_ORIGIN || 'https://collegefootballdata.com';
console.log(`CORS Origin: ${corsOrigin}`);

let corsOptions: cors.CorsOptions = {};

if (env != 'development') {
  corsOptions = {
    origin: (requestOrigin, callback) => {
      console.log(`Request Origin: ${requestOrigin}`);
      if (!requestOrigin || requestOrigin == corsOrigin) {
        console.log('Allowed by CORS', requestOrigin);
        callback(null);
      } else {
        console.log('Not allowed by CORS', requestOrigin);
        callback(new Error(`Not allowed by CORS: ${requestOrigin}`));
      }
    },
  };
}

export default cors(corsOptions);

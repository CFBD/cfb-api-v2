FROM node:20-alpine

RUN mkdir -p /home/node/cfb-api/node_modules && chown -R node:node /home/node/cfb-api

WORKDIR /home/node/cfb-api

COPY package*.json ./

RUN npm install pm2 -g
RUN yarn install

COPY . .
COPY --chown=node:node . .

RUN yarn build

USER node

CMD [ "pm2-runtime", "build/src/app.js" ]

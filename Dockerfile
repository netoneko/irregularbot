FROM node:5-slim

ADD . /opt/telegram-chat-bot

WORKDIR /opt/telegram-chat-bot

RUN npm install

CMD node index.js

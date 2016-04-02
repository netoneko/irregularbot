'use strict';

const config = require('./config.json'),
    Promise = require('bluebird'),
    unirest = require('unirest'),
    _ = require('lodash'),
    readline = require('readline'),
    moment = require('moment'),
    fs = require('fs'),
    irc = require('irc'),
    BASE_URL = "https://api.telegram.org/bot" + config.token + "/",
    DOWNLOAD_URL = "https://api.telegram.org/file/bot" + config.token + "/",
    POLLING_URL = BASE_URL + "getUpdates?offset=:offset:&timeout=60",
    SEND_MESSAGE_URL = BASE_URL + "sendMessage",
    GET_FILE_URL = BASE_URL + "getFile?file_id=:file_id:",
    DEFAULT_OFFSET = 0,
    USERNAME = 'IrregularBot',
    client = new irc.Client(config.irc.server, config.irc.nickname, {channels: config.irc.channels});

const getFile = (data) => {
    data = _.isArray(data) ? _.last(data) : data;
    const url = GET_FILE_URL.replace(":file_id:", data.file_id);

    return new Promise((resolve, reject) => {
        unirest.get(url).end(response => {
                if (response.status !== 200) {
                    console.error(response.status, response.body);
                    return resolve('API error');
                }

                try {
                    const result = response.body.result,
                        path = result.file_path ? `${result.file_path}` : '';

                    return resolve(`${DOWNLOAD_URL}${path}?file_id=${result.file_id}`);
                } catch (err) {
                    console.error(err);
                    return resolve('File is unavailable');
                }
            });
    });

};

const formatMedia = (data) => {
    data = _.isArray(data) ? _.last(data) : data;

    try {
        return getFile(data);
    } catch (err) {
        console.error(err);
        console.error(err.stack);
        return JSON.stringify(data);
    }
};

const formatMessage = (message) => {
    try {
        const formattedMessage = Promise.all([
            //moment.unix(message.date).format(),
            //message.chat.title,
            '@' + message.from.username + ':',
            message.text || formatMedia(message.document || message.photo || message.sticker)
        ]).then(results => results.join(' '));

        return formattedMessage;
    } catch (e) {
        return Promise.resolve(JSON.stringify(message));
    }
};

const relayMessageToIrc = (message) => {
    client.say(config.irc.channels[0], message);
};

const relayMessageToTelegram = (message) => {
    const reply = {
        chat_id: _.last(config.chats).id,
        text: message
    };

    unirest.post(SEND_MESSAGE_URL)
        .send(reply)
        .end(function (response) {
            if (response.status !== 200) {
                console.log(response.status, response.body);
            }
        });
};

const poll = function (offset) {
    const url = POLLING_URL.replace(":offset:", offset || DEFAULT_OFFSET);

    unirest.get(url)
        .end(function (response) {
            const body = response.raw_body;
            var max_offset = DEFAULT_OFFSET;

            if (response.status == 200) {
                const jsonData = JSON.parse(body),
                    results = jsonData.result,
                    messages = _.map(results, 'message');

                if (!_.isEmpty(results)) {
                    max_offset = _.last(results).update_id + 1;
                }

                Promise.map(messages, formatMessage).map(relayMessageToIrc);
            } else {
                console.error(response);
            }

            poll(max_offset);
        });
};

client.addListener('message', (from, to, message) => {
    formatMessage({
        from: {
            username: from
        },
        text: message,
        date: new Date(),
        chat: {
            title: to
        }
    }).then(relayMessageToTelegram);
});

client.addListener('error', (err) => {
    console.error(err);
});

setTimeout(poll, 0);

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
    POLLING_URL = BASE_URL + "getUpdates",
    SEND_MESSAGE_URL = BASE_URL + "sendMessage",
    GET_FILE_URL = BASE_URL + "getFile",
    DEFAULT_OFFSET = 0;

var client = null;

const processGetFileResponse = (resolve, reject, response) => {
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
};

const getFile = (file_id) => {
    return new Promise((resolve, reject) => {
        unirest.get(GET_FILE_URL).query({file_id: file_id})
            .end(_.partial(processGetFileResponse, resolve, reject));
    });
};

const formatMedia = (data) => {
    const file = _.isArray(data) ? _.last(data) : data;
    return getFile(file.file_id);
};

const formatMessage = (message) => {
    try {
        return Promise.all([
            //moment.unix(message.date).format(),
            //message.chat.title,
            '@' + message.from.username + ':',
            message.text || formatMedia(message.document || message.photo || message.sticker)
        ]).then(results => results.join(' '));
    } catch (e) {
        return Promise.resolve(JSON.stringify(message));
    }
};

const getIrcChannel = (config, message) => {
    if (message.chat.id === config.me.id) {
        return config.irc.target;
    }

    return _.findKey(config.chats, {id: message.chat.id});
};

const relayMessageToIrc = (channel, message) => {
    client.say(channel, message);
};

const relayMessageToTelegram = (chat, message) => {
    unirest.post(SEND_MESSAGE_URL)
        .send({
            chat_id: chat.id,
            text: message
        })
        .end(response => {
            if (response.status !== 200) {
                console.error(response.status, response.body);
            }
        });
};

const pollTelegramForNewMessages = (offset) => {
    unirest.get(POLLING_URL).query({
        timeout: 60,
        offset: offset || DEFAULT_OFFSET
    }).end(response => {
        var max_offset = DEFAULT_OFFSET;

        if (response.status !== 200) {
            console.error(response.status, response.body);
        } else {
            const result = response.body.result,
                messages = _.map(result, 'message');

            if (!_.isEmpty(result)) {
                max_offset = _.last(result).update_id + 1;
            }

            Promise.map(messages, (message) => {
                return Promise.all([
                    getIrcChannel(config, message),
                    formatMessage(message)
                ]).spread(relayMessageToIrc);
            });
        }

        pollTelegramForNewMessages(max_offset);
    });
};

const getChat = (config, from, to) => {
    if (to === config.irc.nickname) {
        return config.me;
    }

    return config.chats[to];
};

const onIrcMessage = (from, to, message) => {
    return Promise.all([
        getChat(config, from, to),
        formatMessage({
            from: {
                username: from
            },
            text: message,
            date: new Date(),
            chat: {
                title: to
            }
        })
    ]).spread(relayMessageToTelegram);
};

const main = () => {
    client = new irc.Client(config.irc.server, config.irc.nickname, {
        channels: config.irc.channels
    });

    client.addListener('message', onIrcMessage);
    client.addListener('error', console.error);
    setTimeout(pollTelegramForNewMessages, 0);
};

if (require.main === module) {
    main();
}

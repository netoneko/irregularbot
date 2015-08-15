var config = require('./config.json'),
    unirest = require('unirest'),
    _ = require('lodash'),
    readline = require('readline'),
    moment = require('moment'),
    fs = require('fs'),
    BASE_URL = "https://api.telegram.org/bot" + config.token + "/",
    POLLING_URL = BASE_URL + "getUpdates?offset=:offset:&timeout=60",
    SEND_MESSAGE_URL = BASE_URL + "sendMessage",
    DEFAULT_OFFSET = 0,
    USERNAME = 'IrregularBot';

var printMessage = function (message) {
    try {
        console.log(moment.unix(message.date).format(),
            message.chat.title, '@' + message.from.username + ':',
            message.text || message.document || message.photo || message.sticker);
    } catch (e) {
        console.log(message);
    }
};

var answer = function (chat, input) {
    var reply = {
        chat_id: chat.id,
        text: input
    };

    unirest.post(SEND_MESSAGE_URL)
        .send(reply)
        .end(function (response) {
            if (response.status == 200) {
                console.log(moment().format() + ' \u2713');
                waitForInput();
            }
        });
};

var waitForInput = function () {
    var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        }),
        chat = _.first(config.chats),
        question = _.partial(rl.question, '@' + USERNAME + ': ', function (input) {
            var match;

            if (input === 'ls') {
                console.log(config.chats);
            } else if (match = input.match(/^\/(\d)$/)) {
                chat = config.chats[parseInt(match[1])] || _.first(config.chats);
                console.log('Switched to', chat);
            } else {
                answer(chat, input);
            }

            question();
        }).bind(rl);

    return question;
}();

var saveConfig = function () {
    fs.writeFileSync(__dirname +'/config.json', JSON.stringify(config, null, 2));
};

var updateChatList = function (message) {
    if (!_.include(config.chats, message.chat)) {
        config.chats.push(message.chat);
        saveConfig();
    }
};

var poll = function (offset) {
    var url = POLLING_URL.replace(":offset:", offset || DEFAULT_OFFSET);

    unirest.get(url)
        .end(function (response) {
            var body = response.raw_body,
                max_offset = DEFAULT_OFFSET;

            if (response.status == 200) {
                var jsonData = JSON.parse(body);
                var results = jsonData.result;

                if (!_.isEmpty(results)) {
                    console.log();
                    max_offset = _.last(results).update_id + 1;
                }

                _.forEach(results, function (result) {
                    updateChatList(result.message);
                    printMessage(result.message);
                });
            } else {
                console.error(response);
            }

            waitForInput();

            poll(max_offset);
        });
};

setTimeout(poll, 0);
setTimeout(waitForInput, 0);
